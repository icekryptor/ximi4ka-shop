import type { ReadStream } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import type { Response } from 'express'
import pino from 'pino'
import type { LearningMaterial } from '../../entities/LearningMaterial.js'

// Закрытое хранилище материалов — отдельно от UPLOADS_DIR, который раздаётся
// публично через express.static. Каталог читаем на каждый вызов (а не при
// загрузке модуля), чтобы тесты могли подменить MATERIALS_DIR.
const logger = pino().child({ mod: 'materials-files' })
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

// Обрыв со стороны клиента — не ошибка хранилища, логировать нечего.
const CLIENT_ABORT_CODES = new Set([
  'ERR_STREAM_PREMATURE_CLOSE',
  'ECONNRESET',
  'ERR_STREAM_DESTROYED',
])

const RESPONSE_HEADERS = [
  'Content-Type',
  'Content-Length',
  'Content-Disposition',
  'Cache-Control',
  'X-Content-Type-Options',
]

function isClientAbort(err: unknown, res: Response): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code
  return (code !== undefined && CLIENT_ABORT_CODES.has(code)) || res.destroyed || !res.writable
}

/**
 * Отдаёт файл материала потоком. true — поток отправлен; false — файла нет или
 * он недоступен, и в `res` при этом ничего не записано (вызывающий отвечает 404).
 * Файл открывается один раз: размер берётся из того же дескриптора, что и поток,
 * поэтому удаление файла между проверкой и чтением не ломает контракт.
 */
export async function sendMaterialFile(
  res: Response,
  material: LearningMaterial,
): Promise<boolean> {
  const full = material.fileKey ? resolveMaterialPath(material.fileKey) : null
  if (!full) return false
  let fh: FileHandle
  try {
    fh = await open(full, 'r')
  } catch {
    return false
  }
  let stream: ReadStream
  try {
    const info = await fh.stat()
    if (!info.isFile()) {
      await fh.close()
      return false
    }
    const name = material.fileName ?? material.fileKey ?? 'material'
    res.setHeader('Content-Type', material.mimeType ?? 'application/octet-stream')
    res.setHeader('Content-Length', String(info.size))
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback(name)}"; filename*=UTF-8''${encodeRfc5987(name)}`,
    )
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    // Поток владеет дескриптором и закрывает его по окончании или ошибке.
    stream = fh.createReadStream()
  } catch (err) {
    await fh.close().catch(() => {})
    // Частично выставленные заголовки не должны утечь в ответ 404 вызывающего.
    for (const h of RESPONSE_HEADERS) res.removeHeader(h)
    logger.error({ err, fileKey: material.fileKey }, 'не удалось подготовить отдачу материала')
    return false
  }
  try {
    await pipeline(stream, res)
  } catch (err) {
    if (!isClientAbort(err, res)) {
      logger.error({ err, fileKey: material.fileKey }, 'ошибка при отдаче файла материала')
    }
  }
  return true
}
