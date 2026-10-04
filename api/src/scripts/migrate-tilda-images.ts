// Перенос картинок со старой Tilda (static/thb/optim.tildacdn.com) в свой
// каталог uploads. Если подписку Tilda не продлить, ссылки в БД, YML-фиде и
// разметке перестанут открываться; скрипт находит такие ссылки, скачивает
// файлы и подменяет ссылки на относительные `/uploads/tilda/<хеш>.<ext>`.
//
//   node api/dist/scripts/migrate-tilda-images.js            # dry-run: только план
//   node api/dist/scripts/migrate-tilda-images.js --apply    # скачать и записать в БД
//
// В контейнере: `docker compose exec -T ximishop-api node api/dist/scripts/...`;
// локально: `npm run migrate:tilda-images -w api -- [--apply]`.
//
// Флаги:
//   --dry-run        (по умолчанию) ничего не качает и не пишет — ни в БД, ни на диск;
//   --apply          скачать файлы, обновить карту и записать новые ссылки в БД;
//   --concurrency N  сколько файлов качать одновременно (по умолчанию 4).
//
// Идемпотентно: имя файла — хеш содержимого (одинаковые картинки не множатся),
// карта «ссылка → путь» лежит в uploads/tilda-image-map.json, уже перенесённое
// повторно не качается. Ошибка одной картинки не валит прогон: старая ссылка
// остаётся, ошибка попадает в итоговый отчёт. Только GET публичных адресов.
import 'reflect-metadata'
import { createHash, randomBytes } from 'node:crypto'
import { access, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DataSource } from 'typeorm'
import {
  TILDA_HOSTS,
  TILDA_IMAGE_MAP_FILENAME,
  TILDA_UPLOADS_SUBDIR,
  collectTildaUrls,
  loadTildaImageMap,
  rewriteTildaUrls,
  saveTildaImageMap,
  tildaImageMapPath,
} from '../lib/tildaImages.js'

// ---- Где в БД хранятся ссылки на картинки ----

export interface ColumnTarget {
  table: string
  column: string
  // text — varchar/text, json — jsonb (блоки, переводы, снимки правок).
  kind: 'text' | 'json'
}

const text = (table: string, column: string): ColumnTarget => ({ table, column, kind: 'text' })
const json = (table: string, column: string): ColumnTarget => ({ table, column, kind: 'json' })

// Список составлен по entities/ и сидам: поля-картинки, а также html/блоки/
// переводы, где ссылка может оказаться внутри абзаца. Снимки правок
// (entity_revisions) тоже переписываем: иначе откат к старой версии вернул бы
// в страницу уже мёртвые ссылки на Tilda.
export const IMAGE_TARGETS: readonly ColumnTarget[] = [
  text('product_images', 'url'),
  text('products', 'og_image'),
  text('products', 'short_description'),
  json('products', 'long_description_blocks'),
  json('products', 'translations'),
  json('product_categories', 'translations'),
  text('pages', 'og_image'),
  json('pages', 'blocks'),
  json('pages', 'translations'),
  text('blog_posts', 'cover_image_url'),
  text('blog_posts', 'og_image'),
  text('blog_posts', 'excerpt'),
  json('blog_posts', 'blocks'),
  json('blog_posts', 'translations'),
  text('site_settings', 'header_promo_text'),
  text('site_settings', 'llms_txt'),
  json('site_settings', 'trust_strip_items'),
  json('site_settings', 'testimonials'),
  json('entity_revisions', 'snapshot'),
]

const targetName = (t: ColumnTarget) => `${t.table}.${t.column}`

export interface ImageRow {
  id: string
  // text — строка (или null), json — уже разобранное значение.
  value: unknown
}

export interface ImageDbTx {
  /** Строки колонки, где упомянут tildacdn (включая мягко удалённые). */
  readRows(target: ColumnTarget): Promise<ImageRow[]>
  writeRow(target: ColumnTarget, id: string, value: unknown): Promise<void>
}

export interface ImageDb extends ImageDbTx {
  transaction<T>(fn: (tx: ImageDbTx) => Promise<T>): Promise<T>
}

// Идентификаторы таблиц/колонок берутся только из IMAGE_TARGETS (константы
// выше), значения — параметрами; updated_at сознательно не трогаем: перенос
// файлов не правка контента и не должен сдвигать lastmod в sitemap.
type Query = (sql: string, params?: unknown[]) => Promise<unknown>

function pgTx(query: Query, lock: boolean): ImageDbTx {
  return {
    async readRows(t) {
      const sql =
        `SELECT id::text AS id, "${t.column}" AS value FROM "${t.table}" ` +
        `WHERE "${t.column}"::text ~* 'tildacdn\\.com'${lock ? ' FOR UPDATE' : ''}`
      return (await query(sql)) as ImageRow[]
    },
    async writeRow(t, id, value) {
      if (t.kind === 'json') {
        await query(`UPDATE "${t.table}" SET "${t.column}" = $1::jsonb WHERE id::text = $2`, [
          JSON.stringify(value),
          id,
        ])
      } else {
        await query(`UPDATE "${t.table}" SET "${t.column}" = $1 WHERE id::text = $2`, [value, id])
      }
    },
  }
}

export function createPgImageDb(ds: DataSource): ImageDb {
  return {
    ...pgTx((sql, params) => ds.query(sql, params), false),
    transaction: (fn) =>
      ds.transaction((em) => fn(pgTx((sql, params) => em.query(sql, params), true))),
  }
}

// ---- Скачивание ----

const MAX_BYTES = 25 * 1024 * 1024
const TIMEOUT_MS = 30_000

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

// Сбой, после которого попытку имеет смысл повторить: обрыв сети, таймаут,
// 429/5xx. 404, «не картинка» и прочее — окончательные.
class RetryableError extends Error {}

const ATTEMPTS = 3

// «fetch failed» без причины ничего не говорит оператору: добавляем код из cause.
function describeFetchError(err: unknown): string {
  const base = err instanceof Error ? err.message : String(err)
  const cause = err instanceof Error ? (err.cause as { code?: string; message?: string }) : null
  const detail = cause?.code ?? cause?.message
  return detail ? `${base} (${detail})` : base
}

export interface DownloadOptions {
  fetchImpl: FetchLike
  uploadsDir: string
  maxBytes?: number
  timeoutMs?: number
}

export interface Downloaded {
  localUrl: string
  filePath: string
  bytes: number
  // true — файл с таким содержимым уже лежал (дедупликация).
  reused: boolean
}

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
}

// Расширение по сигнатуре файла: Content-Type у CDN бывает неточным, а вместо
// картинки может прийти html-страница с ошибкой.
function sniffExtension(buf: Buffer): string | null {
  if (buf.length >= 4 && buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG') {
    return '.png'
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg'
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return '.gif'
  if (
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return '.webp'
  }
  if (/^ftyp(avif|avis)/.test(buf.subarray(4, 12).toString('latin1'))) return '.avif'
  const head = buf.subarray(0, 1024).toString('utf-8').trimStart()
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)?<svg[\s>]/i.test(head)) return '.svg'
  return null
}

export async function downloadTildaImage(
  rawUrl: string,
  { fetchImpl, uploadsDir, maxBytes = MAX_BYTES, timeoutMs = TIMEOUT_MS }: DownloadOptions,
): Promise<Downloaded> {
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:') throw new Error(`не https: ${rawUrl}`)
  if (!TILDA_HOSTS.includes(url.hostname)) throw new Error(`чужой хост: ${url.hostname}`)

  let res: Response
  try {
    res = await fetchImpl(url.href, {
      method: 'GET',
      redirect: 'follow',
      headers: { accept: 'image/*' },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw new RetryableError(describeFetchError(err))
  }
  if (!res.ok) {
    const message = `HTTP ${res.status}`
    throw res.status >= 500 || res.status === 429 ? new RetryableError(message) : new Error(message)
  }
  if (res.url && !TILDA_HOSTS.includes(new URL(res.url).hostname)) {
    throw new Error(`редирект на чужой хост: ${new URL(res.url).hostname}`)
  }
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > maxBytes) throw new Error(`размер ${declared} байт больше лимита ${maxBytes}`)

  let buf: Buffer
  try {
    buf = Buffer.from(await res.arrayBuffer())
  } catch (err) {
    throw new RetryableError(describeFetchError(err))
  }
  if (buf.length === 0) throw new Error('пустой ответ')
  if (buf.length > maxBytes) throw new Error(`размер ${buf.length} байт больше лимита ${maxBytes}`)

  const contentType = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  const ext = sniffExtension(buf) ?? EXT_BY_CONTENT_TYPE[contentType]
  if (!ext) throw new Error(`не картинка (content-type: ${contentType || 'нет'})`)

  // 128 бит sha-256: коллизия невозможна на практике, но совпадение имени всё
  // равно проверяем побайтно — подмена файла молча не пройдёт.
  const name = `${createHash('sha256').update(buf).digest('hex').slice(0, 32)}${ext}`
  const dir = path.join(uploadsDir, TILDA_UPLOADS_SUBDIR)
  const filePath = path.join(dir, name)
  const localUrl = `/uploads/${TILDA_UPLOADS_SUBDIR}/${name}`

  let reused = false
  try {
    const existing = await readFile(filePath)
    if (!existing.equals(buf)) throw new Error(`коллизия имени ${name}: содержимое отличается`)
    reused = true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  if (!reused) {
    await mkdir(dir, { recursive: true })
    // Уникальное tmp-имя: две ссылки с одинаковым содержимым качаются параллельно.
    const tmp = `${filePath}.${randomBytes(6).toString('hex')}.tmp`
    await writeFile(tmp, buf)
    await rename(tmp, filePath)
  }
  return { localUrl, filePath, bytes: buf.length, reused }
}

async function downloadWithRetry(
  url: string,
  opts: DownloadOptions,
  retryDelayMs: number,
): Promise<Downloaded> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await downloadTildaImage(url, opts)
    } catch (err) {
      if (!(err instanceof RetryableError) || attempt >= ATTEMPTS) throw err
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt))
    }
  }
}

// ---- Основной прогон ----

export type UrlStatus = 'downloaded' | 'already' | 'would-download' | 'failed'

export interface UrlResult {
  url: string
  // Где встретилась: `таблица.колонка` или `data:<файл>`.
  sources: string[]
  status: UrlStatus
  localUrl?: string
  error?: string
}

export interface ColumnReport {
  target: string
  // Сколько строк колонки содержат ссылки на tildacdn.
  rows: number
  // Сколько из них переписано (в dry-run всегда 0).
  updated: number
}

export interface MigrationReport {
  apply: boolean
  urls: UrlResult[]
  columns: ColumnReport[]
  counts: {
    total: number
    downloaded: number
    already: number
    wouldDownload: number
    failed: number
  }
  mapFile: string
}

export interface MigrateOptions {
  db: ImageDb
  fetchImpl: FetchLike
  uploadsDir: string
  apply: boolean
  // JSON-файлы репозитория (api/data/*.json): их ссылки тоже попадают в карту,
  // сами файлы не правятся — сид-импорты подставляют карту при загрузке.
  dataFiles?: string[]
  concurrency?: number
  // Пауза перед повтором (× номер попытки); в тестах 0.
  retryDelayMs?: number
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

export async function migrateTildaImages(opts: MigrateOptions): Promise<MigrationReport> {
  const {
    db,
    fetchImpl,
    uploadsDir,
    apply,
    dataFiles = [],
    concurrency = 4,
    retryDelayMs = 1000,
  } = opts
  const mapFile = tildaImageMapPath(uploadsDir)
  const map = await loadTildaImageMap(mapFile)

  // 1. Что есть: ссылки из БД и из файлов данных.
  const sources = new Map<string, Set<string>>()
  const addSource = (url: string, source: string) => {
    if (!sources.has(url)) sources.set(url, new Set())
    sources.get(url)!.add(source)
  }
  const columns: ColumnReport[] = []
  for (const target of IMAGE_TARGETS) {
    const rows = await db.readRows(target)
    if (rows.length === 0) continue
    columns.push({ target: targetName(target), rows: rows.length, updated: 0 })
    for (const row of rows) {
      const found = new Set<string>()
      collectTildaUrls(row.value, found)
      for (const url of found) addSource(url, targetName(target))
    }
  }
  for (const file of dataFiles) {
    const found = new Set<string>()
    collectTildaUrls(JSON.parse(await readFile(file, 'utf-8')), found)
    for (const url of found) addSource(url, `data:${path.basename(file)}`)
  }

  // 2. Что уже перенесено (запись в карте и файл на месте), что нужно качать.
  const urls: UrlResult[] = [...sources.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([url, src]) => ({ url, sources: [...src].sort(), status: 'would-download' as UrlStatus }))
  const resolved = new Map<string, string>()
  const pending: UrlResult[] = []
  for (const item of urls) {
    const known = map.get(item.url)
    if (known && (await fileExists(path.join(uploadsDir, known.replace(/^\/uploads\//, ''))))) {
      item.status = 'already'
      item.localUrl = known
      resolved.set(item.url, known)
    } else {
      pending.push(item)
    }
  }

  // 3. Скачивание (только с --apply), ограниченным числом потоков.
  if (apply) {
    let cursor = 0
    const worker = async () => {
      while (cursor < pending.length) {
        const item = pending[cursor++]!
        try {
          const got = await downloadWithRetry(item.url, { fetchImpl, uploadsDir }, retryDelayMs)
          item.status = 'downloaded'
          item.localUrl = got.localUrl
          resolved.set(item.url, got.localUrl)
        } catch (err) {
          item.status = 'failed'
          item.error = err instanceof Error ? err.message : String(err)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker))

    // Карту сохраняем до записи в БД: если запись упадёт, повторный запуск не
    // будет качать то же самое заново.
    const before = map.size
    for (const [url, local] of resolved) map.set(url, local)
    if (map.size !== before || pending.some((p) => p.status === 'downloaded')) {
      await saveTildaImageMap(mapFile, map)
    }

    // 4. Запись в БД одной транзакцией. Строки читаем заново (с блокировкой):
    // пока качались файлы, админ мог поправить страницу.
    await db.transaction(async (tx) => {
      for (const target of IMAGE_TARGETS) {
        const rows = await tx.readRows(target)
        let updated = 0
        for (const row of rows) {
          const out = rewriteTildaUrls(row.value, resolved)
          if (out.replaced === 0) continue
          await tx.writeRow(target, row.id, out.value)
          updated++
        }
        const col = columns.find((c) => c.target === targetName(target))
        if (col) col.updated = updated
      }
    })
  }

  const count = (s: UrlStatus) => urls.filter((u) => u.status === s).length
  return {
    apply,
    urls,
    columns,
    counts: {
      total: urls.length,
      downloaded: count('downloaded'),
      already: count('already'),
      wouldDownload: count('would-download'),
      failed: count('failed'),
    },
    mapFile,
  }
}

// ---- CLI ----

export interface CliOptions {
  apply: boolean
  concurrency: number
}

export function parseArgs(argv: string[]): CliOptions {
  let apply = false
  let dryRun = false
  let concurrency = 4
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--apply') apply = true
    else if (a === '--dry-run') dryRun = true
    else if (a === '--concurrency') {
      const n = Number(argv[++i])
      if (!Number.isInteger(n) || n < 1) throw new Error('--concurrency: нужно целое число ≥ 1')
      concurrency = n
    } else {
      throw new Error(
        `неизвестный аргумент: ${a}\nИспользование: migrate-tilda-images [--dry-run | --apply] [--concurrency N]`,
      )
    }
  }
  if (apply && dryRun) throw new Error('--apply и --dry-run вместе не используются')
  return { apply, concurrency }
}

export function formatReport(report: MigrationReport): string {
  const { counts } = report
  const lines: string[] = []
  lines.push('')
  lines.push(
    report.apply
      ? '=== Перенос картинок Tilda → /uploads: APPLY ==='
      : '=== Перенос картинок Tilda → /uploads: DRY-RUN (ничего не скачано и не записано) ===',
  )
  lines.push(`Уникальных ссылок:   ${counts.total}`)
  if (report.apply) {
    lines.push(`Скачано:             ${counts.downloaded}`)
    lines.push(`Уже перенесено:      ${counts.already}`)
    lines.push(`Ошибок:              ${counts.failed}`)
  } else {
    lines.push(`Нужно скачать:       ${counts.wouldDownload}`)
    lines.push(`Уже перенесено:      ${counts.already}`)
  }
  if (report.columns.length > 0) {
    lines.push('')
    lines.push('Колонки БД со ссылками на tildacdn (строк / переписано):')
    for (const c of report.columns) {
      lines.push(`  ${c.target.padEnd(36)} ${String(c.rows).padStart(4)} / ${c.updated}`)
    }
  }
  lines.push('')
  lines.push('Ссылки:')
  for (const u of report.urls) {
    const to = u.localUrl ? ` -> ${u.localUrl}` : ''
    lines.push(`  [${u.status}] ${u.url}${to}`)
    lines.push(`      ${u.sources.join(', ')}`)
  }
  const failed = report.urls.filter((u) => u.status === 'failed')
  if (failed.length > 0) {
    lines.push('')
    lines.push(`ОШИБКИ (${failed.length}) — старые ссылки в БД остались, повторите запуск позже:`)
    for (const u of failed) lines.push(`  ${u.url}\n      ${u.error}`)
  }
  if (report.apply) lines.push('', `Карта ссылок: ${report.mapFile}`)
  else lines.push('', 'Для записи запустите с --apply (сначала сделайте бэкап БД).')
  lines.push('')
  return lines.join('\n')
}

async function listDataFiles(): Promise<string[]> {
  // api/data рядом с src/ и dist/: в runtime-образе его нет — тогда пропускаем.
  const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data')
  try {
    return (await readdir(dataDir))
      .filter((f) => f.endsWith('.json') && f !== TILDA_IMAGE_MAP_FILENAME)
      .map((f) => path.join(dataDir, f))
  } catch {
    return []
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  await import('dotenv/config')
  const { AppDataSource } = await import('../config/dataSource.js')
  const { UPLOADS_DIR } = await import('../lib/storage/index.js')

  await AppDataSource.initialize()
  try {
    const report = await migrateTildaImages({
      db: createPgImageDb(AppDataSource),
      fetchImpl: (input, init) => fetch(input, init),
      uploadsDir: UPLOADS_DIR,
      apply: opts.apply,
      dataFiles: await listDataFiles(),
      concurrency: opts.concurrency,
    })
    console.log(formatReport(report))
    if (report.counts.failed > 0) process.exitCode = 1
  } finally {
    await AppDataSource.destroy()
  }
}

// Запуск только напрямую (tsx/node), не при импорте из тестов.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
