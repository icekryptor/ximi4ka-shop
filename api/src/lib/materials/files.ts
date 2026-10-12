import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import type { Response } from 'express'
import type { LearningMaterial } from '../../entities/LearningMaterial.js'

// Закрытое хранилище материалов — отдельно от UPLOADS_DIR, который раздаётся
// публично через express.static. Каталог читаем на каждый вызов (а не при
// загрузке модуля), чтобы тесты могли подменить MATERIALS_DIR.
const thisDir = path.dirname(fileURLToPath(import.meta.url))

export function materialsDir(): string {
  const fromEnv = process.env.MATERIALS_DIR
  // src/lib/materials/ → src/lib/ → src/ → api/. +/materials
  return fromEnv ? path.resolve(fromEnv) : path.resolve(thisDir, '../../..', 'materials')
}

/**
 * Абсолютный путь файла внутри каталога материалов или null. file_key — только
 * базовое имя: без каталогов, без «..», без скрытых файлов и NUL-байтов.
 */
export function resolveMaterialPath(fileKey: string): string | null {
  if (!fileKey || fileKey.includes('\0')) return null
  if (fileKey !== path.basename(fileKey) || fileKey.startsWith('.')) return null
  const root = materialsDir()
  const full = path.resolve(root, fileKey)
  return full.startsWith(root + path.sep) ? full : null
}

// RFC 5987: encodeURIComponent не трогает ' ( ) * — а в значении filename* их нельзя.
function encodeRfc5987(name: string): string {
  return encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

// Запасное имя для клиентов без filename*: только печатный ASCII без кавычек.
function asciiFallback(name: string): string {
  return name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
}

/**
 * Отдаёт файл материала потоком. true — поток отправлен; false — файла нет или
 * он недоступен, и в `res` при этом ничего не записано (вызывающий отвечает 404).
 */
export async function sendMaterialFile(
  res: Response,
  material: LearningMaterial,
): Promise<boolean> {
  const full = material.fileKey ? resolveMaterialPath(material.fileKey) : null
  if (!full) return false
  let size: number
  try {
    const info = await stat(full)
    if (!info.isFile()) return false
    size = info.size
  } catch {
    return false
  }
  const name = material.fileName ?? material.fileKey ?? 'material'
  res.setHeader('Content-Type', material.mimeType ?? 'application/octet-stream')
  res.setHeader('Content-Length', String(size))
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiFallback(name)}"; filename*=UTF-8''${encodeRfc5987(name)}`,
  )
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  try {
    await pipeline(createReadStream(full), res)
  } catch {
    // Клиент оборвал загрузку — заголовки уже ушли, отвечать нечем.
  }
  return true
}
