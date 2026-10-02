import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Картинки со старой Tilda (static/thb/optim.tildacdn.com) переезжают в наш
// каталог uploads; здесь — общие для скрипта переноса и сид-импортов куски:
// поиск ссылок, их подмена в произвольных JSON-структурах и «карта» вида
// «ссылка на Tilda → /uploads/tilda/<хеш>.<ext>».

// Подкаталог uploads, куда скрипт кладёт перенесённые файлы.
export const TILDA_UPLOADS_SUBDIR = 'tilda'
// Карта лежит в том же каталоге uploads (на сервере — в docker-томе), рядом
// с файлами, на которые ссылается.
export const TILDA_IMAGE_MAP_FILENAME = 'tilda-image-map.json'

export const TILDA_HOSTS: readonly string[] = [
  'static.tildacdn.com',
  'thb.tildacdn.com',
  'optim.tildacdn.com',
]

// Ссылка заканчивается на пробеле, кавычке, скобке или угловой скобке — так
// она отделяется и в html-атрибуте, и в тексте абзаца.
const URL_PATTERN = '(?:https?:)?//(?:static|thb|optim)\\.tildacdn\\.com/[^\\s"\'<>()`\\\\]+'
// Знаки препинания в конце фразы к ссылке не относятся.
const TRAILING_PUNCTUATION = /[.,;:!?]+$/

function urlRegExp(): RegExp {
  return new RegExp(URL_PATTERN, 'gi')
}

function splitTrailing(match: string): { url: string; tail: string } {
  const tail = TRAILING_PUNCTUATION.exec(match)?.[0] ?? ''
  return { url: tail ? match.slice(0, -tail.length) : match, tail }
}

// Ключ карты: всегда абсолютный https-адрес.
export function normalizeTildaUrl(raw: string): string {
  if (raw.startsWith('//')) return `https:${raw}`
  return raw.replace(/^http:\/\//i, 'https://')
}

/** Все ссылки на tildacdn в строке — в том виде, в каком они в ней написаны. */
export function findTildaUrls(text: string): string[] {
  return [...text.matchAll(urlRegExp())].map((m) => splitTrailing(m[0]).url)
}

/** Складывает нормализованные ссылки из строк любой вложенности в `into`. */
export function collectTildaUrls(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') {
    for (const url of findTildaUrls(value)) into.add(normalizeTildaUrl(url))
  } else if (Array.isArray(value)) {
    for (const item of value) collectTildaUrls(item, into)
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectTildaUrls(item, into)
  }
}

export interface RewriteResult<T> {
  value: T
  replaced: number
}

/**
 * Подменяет ссылки из карты во всех строках `value` (строка, объект, массив,
 * html-абзац). Исходник не мутирует. Ссылки, которых в карте нет, остаются.
 */
export function rewriteTildaUrls<T>(value: T, map: ReadonlyMap<string, string>): RewriteResult<T> {
  let replaced = 0
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      return v.replace(urlRegExp(), (match) => {
        const { url, tail } = splitTrailing(match)
        const target = map.get(normalizeTildaUrl(url))
        if (!target) return match
        replaced++
        return `${target}${tail}`
      })
    }
    if (Array.isArray(v)) return v.map(walk)
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, item]) => [k, walk(item)]))
    }
    return v
  }
  return { value: walk(value) as T, replaced }
}

/** Читает карту; нет файла — пустая карта, битый файл — ошибка. */
export async function loadTildaImageMap(file: string): Promise<Map<string, string>> {
  let raw: string
  try {
    raw = await readFile(file, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return new Map()
    throw err
  }
  const parsed: unknown = JSON.parse(raw)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${file}: ожидался объект «ссылка → путь»`)
  }
  return new Map(Object.entries(parsed as Record<string, string>))
}

/** Пишет карту с отсортированными ключами (стабильный diff) через tmp + rename. */
export async function saveTildaImageMap(
  file: string,
  map: ReadonlyMap<string, string>,
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  const sorted = Object.fromEntries([...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)))
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, `${JSON.stringify(sorted, null, 2)}\n`, 'utf-8')
  await rename(tmp, file)
}

export function tildaImageMapPath(uploadsDir: string): string {
  return path.join(uploadsDir, TILDA_IMAGE_MAP_FILENAME)
}

/**
 * Карта для сид-импортов (import-tilda-catalog / -articles): после переноса они
 * подставляют `/uploads/tilda/…` вместо ссылок на Tilda из api/data/*.json, не
 * меняя сами файлы. По умолчанию — карта из uploads (на сервере она там, где и
 * файлы); `explicitPath` — карта, скопированная с сервера; `disabled` — без
 * подстановки. Явный путь, которого нет, — ошибка, а не тихая пустая карта.
 */
export async function loadSeedImageMap(opts: {
  uploadsDir: string
  explicitPath?: string | null
  disabled?: boolean
}): Promise<Map<string, string>> {
  if (opts.disabled) return new Map()
  if (opts.explicitPath) {
    await access(opts.explicitPath)
    return loadTildaImageMap(opts.explicitPath)
  }
  return loadTildaImageMap(tildaImageMapPath(opts.uploadsDir))
}
