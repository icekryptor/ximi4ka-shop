import { createHash } from 'node:crypto'
import { access, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TILDA_IMAGE_MAP_FILENAME } from '../lib/tildaImages.js'
import {
  IMAGE_TARGETS,
  downloadTildaImage,
  formatReport,
  migrateTildaImages,
  parseArgs,
  type ColumnTarget,
  type ImageDb,
  type ImageDbTx,
  type ImageRow,
} from './migrate-tilda-images.js'

const U1 = 'https://static.tildacdn.com/stor1111-2222-3333-4444-555566667777/one.png'
const U2 = 'https://static.tildacdn.com/tild2222-3333-4444-5555-666677778888/two.jpg'
const U3 = 'https://thb.tildacdn.com/tild3333-4444-5555-6666-777788889999/-/resize/20x/three.jpg'

const PNG_A = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('payload-a'),
])
const PNG_B = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('payload-b'),
])
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jpeg-payload')])

const sha32 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex').slice(0, 32)

interface Reply {
  status?: number
  body: Buffer | string
  type?: string
}

function makeFetch(replies: Record<string, Reply | 'throw'>) {
  return vi.fn(async (input: unknown) => {
    const url = String(input)
    const r = replies[url]
    if (!r) return new Response('not found', { status: 404 })
    if (r === 'throw') throw new Error('network down')
    return new Response(r.body as BodyInit, {
      status: r.status ?? 200,
      headers: { 'content-type': r.type ?? 'image/png' },
    })
  })
}

const key = (t: ColumnTarget) => `${t.table}.${t.column}`

class FakeDb implements ImageDb {
  tables = new Map<string, Map<string, unknown>>()
  writes = 0

  set(table: string, column: string, id: string, value: unknown): this {
    const k = `${table}.${column}`
    if (!this.tables.has(k)) this.tables.set(k, new Map())
    this.tables.get(k)!.set(id, value)
    return this
  }
  get(table: string, column: string, id: string): unknown {
    return this.tables.get(`${table}.${column}`)?.get(id)
  }
  async readRows(t: ColumnTarget): Promise<ImageRow[]> {
    const rows = this.tables.get(key(t))
    if (!rows) return []
    return [...rows.entries()]
      .filter(([, v]) => JSON.stringify(v).includes('tildacdn'))
      .map(([id, value]) => ({ id, value: structuredClone(value) }))
  }
  async writeRow(t: ColumnTarget, id: string, value: unknown): Promise<void> {
    this.writes++
    this.tables.get(key(t))!.set(id, value)
  }
  async transaction<T>(fn: (tx: ImageDbTx) => Promise<T>): Promise<T> {
    return fn(this)
  }
}

describe('migrate-tilda-images', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'tilda-migrate-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const exists = (p: string) =>
    access(p).then(
      () => true,
      () => false,
    )

  function seedDb(): FakeDb {
    return new FakeDb()
      .set('product_images', 'url', 'img1', U1)
      .set('product_images', 'url', 'img2', U2)
      .set('products', 'og_image', 'p1', U1)
      .set('products', 'long_description_blocks', 'p1', [
        { type: 'paragraph', html: `<p>Фото <img src="${U3}"></p>` },
      ])
      .set('blog_posts', 'cover_image_url', 'b1', U2)
      .set('blog_posts', 'blocks', 'b1', [{ type: 'image', url: U2, alt: 'x' }])
      .set('pages', 'blocks', 'pg1', [{ type: 'image', url: U1 }])
  }

  describe('dry-run (по умолчанию)', () => {
    it('ничего не качает и не пишет, но печатает план', async () => {
      const db = seedDb()
      const fetchImpl = makeFetch({})
      const report = await migrateTildaImages({ db, fetchImpl, uploadsDir: dir, apply: false })

      expect(fetchImpl).not.toHaveBeenCalled()
      expect(db.writes).toBe(0)
      expect(await exists(path.join(dir, 'tilda'))).toBe(false)
      expect(await exists(path.join(dir, TILDA_IMAGE_MAP_FILENAME))).toBe(false)
      expect(db.get('product_images', 'url', 'img1')).toBe(U1)

      expect(report.apply).toBe(false)
      expect(report.urls.map((u) => u.url).sort()).toEqual([U1, U2, U3].sort())
      expect(report.urls.every((u) => u.status === 'would-download')).toBe(true)
      expect(report.counts.total).toBe(3)
      const u1 = report.urls.find((u) => u.url === U1)!
      expect(u1.sources).toEqual(
        expect.arrayContaining(['product_images.url', 'products.og_image', 'pages.blocks']),
      )
      const text = formatReport(report)
      expect(text).toContain('DRY-RUN')
      expect(text).toContain(U1)
    })
  })

  describe('--apply', () => {
    it('скачивает, кладёт под хешем содержимого и подменяет url в БД', async () => {
      const db = seedDb()
      const fetchImpl = makeFetch({
        [U1]: { body: PNG_A, type: 'image/png' },
        [U2]: { body: JPG, type: 'image/jpeg' },
        [U3]: { body: PNG_B, type: 'image/png' },
      })
      const report = await migrateTildaImages({ db, fetchImpl, uploadsDir: dir, apply: true })

      const n1 = `/uploads/tilda/${sha32(PNG_A)}.png`
      const n2 = `/uploads/tilda/${sha32(JPG)}.jpg`
      const n3 = `/uploads/tilda/${sha32(PNG_B)}.png`
      expect(report.counts).toMatchObject({ total: 3, downloaded: 3, failed: 0 })

      expect(db.get('product_images', 'url', 'img1')).toBe(n1)
      expect(db.get('product_images', 'url', 'img2')).toBe(n2)
      expect(db.get('products', 'og_image', 'p1')).toBe(n1)
      expect(db.get('products', 'long_description_blocks', 'p1')).toEqual([
        { type: 'paragraph', html: `<p>Фото <img src="${n3}"></p>` },
      ])
      expect(db.get('blog_posts', 'cover_image_url', 'b1')).toBe(n2)
      expect(db.get('blog_posts', 'blocks', 'b1')).toEqual([{ type: 'image', url: n2, alt: 'x' }])
      expect(db.get('pages', 'blocks', 'pg1')).toEqual([{ type: 'image', url: n1 }])

      const files = (await readdir(path.join(dir, 'tilda'))).sort()
      expect(files).toEqual(
        [`${sha32(PNG_A)}.png`, `${sha32(JPG)}.jpg`, `${sha32(PNG_B)}.png`].sort(),
      )
      expect(await readFile(path.join(dir, 'tilda', `${sha32(PNG_A)}.png`))).toEqual(PNG_A)

      const map = JSON.parse(await readFile(path.join(dir, TILDA_IMAGE_MAP_FILENAME), 'utf-8'))
      expect(map).toEqual({ [U1]: n1, [U2]: n2, [U3]: n3 })

      const touched = report.columns.find((c) => c.target === 'product_images.url')!
      expect(touched).toMatchObject({ rows: 2, updated: 2 })
    })

    it('дедуплицирует одинаковое содержимое по разным url', async () => {
      const db = new FakeDb()
        .set('product_images', 'url', 'a', U1)
        .set('product_images', 'url', 'b', U2)
      const fetchImpl = makeFetch({
        [U1]: { body: PNG_A },
        [U2]: { body: PNG_A },
      })
      await migrateTildaImages({ db, fetchImpl, uploadsDir: dir, apply: true })
      expect(await readdir(path.join(dir, 'tilda'))).toEqual([`${sha32(PNG_A)}.png`])
      expect(db.get('product_images', 'url', 'a')).toBe(db.get('product_images', 'url', 'b'))
    })

    it('повторный запуск не качает уже перенесённое', async () => {
      const first = await migrateTildaImages({
        db: seedDb(),
        fetchImpl: makeFetch({
          [U1]: { body: PNG_A },
          [U2]: { body: JPG, type: 'image/jpeg' },
          [U3]: { body: PNG_B },
        }),
        uploadsDir: dir,
        apply: true,
      })
      expect(first.counts.downloaded).toBe(3)

      // БД «откатилась» (старые url вернулись), файлы и карта на месте.
      const fetchAgain = makeFetch({})
      const db2 = seedDb()
      const second = await migrateTildaImages({
        db: db2,
        fetchImpl: fetchAgain,
        uploadsDir: dir,
        apply: true,
      })
      expect(fetchAgain).not.toHaveBeenCalled()
      expect(second.counts).toMatchObject({ total: 3, downloaded: 0, already: 3, failed: 0 })
      expect(db2.get('product_images', 'url', 'img1')).toBe(`/uploads/tilda/${sha32(PNG_A)}.png`)

      // Третий запуск по уже обновлённой БД — делать нечего.
      const writesBefore = db2.writes
      const third = await migrateTildaImages({
        db: db2,
        fetchImpl: fetchAgain,
        uploadsDir: dir,
        apply: true,
      })
      expect(third.counts.total).toBe(0)
      expect(db2.writes).toBe(writesBefore)
    })

    it('если файл из карты пропал с диска — качает заново', async () => {
      const replies = { [U1]: { body: PNG_A } }
      const mk = () => new FakeDb().set('product_images', 'url', 'a', U1)
      await migrateTildaImages({
        db: mk(),
        fetchImpl: makeFetch(replies),
        uploadsDir: dir,
        apply: true,
      })
      await rm(path.join(dir, 'tilda'), { recursive: true })
      const fetchImpl = makeFetch(replies)
      await migrateTildaImages({ db: mk(), fetchImpl, uploadsDir: dir, apply: true })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(await exists(path.join(dir, 'tilda', `${sha32(PNG_A)}.png`))).toBe(true)
    })

    it('ошибка одной картинки не валит прогон: старый url остаётся, ошибка в отчёте', async () => {
      const db = seedDb()
      const fetchImpl = makeFetch({
        [U1]: { body: PNG_A },
        [U2]: { status: 404, body: 'nope' },
        [U3]: 'throw',
      })
      const report = await migrateTildaImages({
        db,
        fetchImpl,
        uploadsDir: dir,
        apply: true,
        retryDelayMs: 0,
      })

      expect(report.counts).toMatchObject({ total: 3, downloaded: 1, failed: 2 })
      expect(db.get('product_images', 'url', 'img1')).toBe(`/uploads/tilda/${sha32(PNG_A)}.png`)
      expect(db.get('product_images', 'url', 'img2')).toBe(U2)
      expect(db.get('blog_posts', 'cover_image_url', 'b1')).toBe(U2)
      expect(db.get('products', 'long_description_blocks', 'p1')).toEqual([
        { type: 'paragraph', html: `<p>Фото <img src="${U3}"></p>` },
      ])
      const failed = report.urls.filter((u) => u.status === 'failed')
      expect(failed.map((f) => f.url).sort()).toEqual([U2, U3].sort())
      expect(failed.find((f) => f.url === U2)!.error).toMatch(/404/)
      const text = formatReport(report)
      expect(text).toContain('ОШИБКИ')
      expect(text).toContain(U2)
    })

    it('повторяет попытку при сетевом сбое и 5xx, но не при 404', async () => {
      const db = new FakeDb()
        .set('product_images', 'url', 'a', U1)
        .set('product_images', 'url', 'b', U2)
      const fetchImpl = makeFetch({ [U1]: { body: PNG_A }, [U2]: { status: 404, body: 'nope' } })
      const ok = fetchImpl.getMockImplementation()!
      let u1Calls = 0
      fetchImpl.mockImplementation(async (input: unknown) => {
        if (String(input) === U1 && ++u1Calls === 1) {
          throw new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } })
        }
        if (String(input) === U1 && u1Calls === 2) return new Response('busy', { status: 503 })
        return ok(input)
      })
      const report = await migrateTildaImages({
        db,
        fetchImpl,
        uploadsDir: dir,
        apply: true,
        retryDelayMs: 0,
      })
      expect(u1Calls).toBe(3)
      expect(report.urls.find((u) => u.url === U1)!.status).toBe('downloaded')
      const calls404 = fetchImpl.mock.calls.filter((c) => String(c[0]) === U2).length
      expect(calls404).toBe(1)
    })

    it('в сообщении о сетевой ошибке есть причина', async () => {
      const db = new FakeDb().set('product_images', 'url', 'a', U1)
      const fetchImpl = vi.fn(async () => {
        throw new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } })
      })
      const report = await migrateTildaImages({
        db,
        fetchImpl,
        uploadsDir: dir,
        apply: true,
        retryDelayMs: 0,
      })
      expect(fetchImpl).toHaveBeenCalledTimes(3)
      expect(report.urls[0]!.error).toContain('UND_ERR_CONNECT_TIMEOUT')
    })

    it('частично заменяет строку, где одна ссылка скачалась, а другая нет', async () => {
      const db = new FakeDb().set('pages', 'blocks', 'pg', [
        { type: 'paragraph', html: `<img src="${U1}"><img src="${U2}">` },
      ])
      const fetchImpl = makeFetch({ [U1]: { body: PNG_A }, [U2]: { status: 500, body: 'x' } })
      await migrateTildaImages({
        db,
        fetchImpl,
        uploadsDir: dir,
        apply: true,
        retryDelayMs: 0,
      })
      expect(db.get('pages', 'blocks', 'pg')).toEqual([
        {
          type: 'paragraph',
          html: `<img src="/uploads/tilda/${sha32(PNG_A)}.png"><img src="${U2}">`,
        },
      ])
    })

    it('не принимает html вместо картинки', async () => {
      const db = new FakeDb().set('product_images', 'url', 'a', U1)
      const fetchImpl = makeFetch({
        [U1]: { body: '<html>captcha</html>', type: 'text/html; charset=utf-8' },
      })
      const report = await migrateTildaImages({ db, fetchImpl, uploadsDir: dir, apply: true })
      expect(report.counts.failed).toBe(1)
      expect(db.get('product_images', 'url', 'a')).toBe(U1)
      expect(await exists(path.join(dir, 'tilda'))).toBe(false)
    })
  })

  describe('файлы данных в репозитории', () => {
    it('учитывает ссылки из json в карте, но не правит сами файлы', async () => {
      const file = path.join(dir, 'tilda-catalog.json')
      const original = JSON.stringify([{ images: [{ url: U1 }] }, { cover: U2 }])
      await writeFile(file, original)
      const uploads = path.join(dir, 'uploads')

      const dry = await migrateTildaImages({
        db: new FakeDb(),
        fetchImpl: makeFetch({}),
        uploadsDir: uploads,
        apply: false,
        dataFiles: [file],
      })
      expect(dry.urls.map((u) => u.url).sort()).toEqual([U1, U2].sort())
      expect(dry.urls[0]!.sources).toEqual(['data:tilda-catalog.json'])

      const fetchImpl = makeFetch({
        [U1]: { body: PNG_A },
        [U2]: { body: JPG, type: 'image/jpeg' },
      })
      const db = new FakeDb()
      const report = await migrateTildaImages({
        db,
        fetchImpl,
        uploadsDir: uploads,
        apply: true,
        dataFiles: [file],
      })
      expect(report.counts.downloaded).toBe(2)
      expect(db.writes).toBe(0)
      expect(await readFile(file, 'utf-8')).toBe(original)
      const map = JSON.parse(await readFile(path.join(uploads, TILDA_IMAGE_MAP_FILENAME), 'utf-8'))
      expect(Object.keys(map).sort()).toEqual([U1, U2].sort())
    })
  })

  describe('downloadTildaImage', () => {
    it('отказывается ходить на чужие хосты и не по https', async () => {
      const fetchImpl = makeFetch({})
      const opts = { fetchImpl, uploadsDir: dir }
      await expect(downloadTildaImage('https://evil.example.com/a.png', opts)).rejects.toThrow(
        /хост/,
      )
      await expect(downloadTildaImage('ftp://static.tildacdn.com/a.png', opts)).rejects.toThrow()
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('делает только GET', async () => {
      const fetchImpl = makeFetch({ [U1]: { body: PNG_A } })
      await downloadTildaImage(U1, { fetchImpl, uploadsDir: dir })
      const init = fetchImpl.mock.calls[0]![1] as RequestInit | undefined
      expect(init?.method ?? 'GET').toBe('GET')
    })

    it('не принимает слишком большой файл', async () => {
      const fetchImpl = makeFetch({ [U1]: { body: PNG_A } })
      await expect(
        downloadTildaImage(U1, { fetchImpl, uploadsDir: dir, maxBytes: 4 }),
      ).rejects.toThrow(/размер/)
    })

    it('падает, если под тем же именем лежит файл с другим содержимым', async () => {
      const fetchImpl = makeFetch({ [U1]: { body: PNG_A } })
      await downloadTildaImage(U1, { fetchImpl, uploadsDir: dir })
      await writeFile(path.join(dir, 'tilda', `${sha32(PNG_A)}.png`), 'corrupted')
      await expect(downloadTildaImage(U1, { fetchImpl, uploadsDir: dir })).rejects.toThrow(/коллиз/)
    })
  })

  describe('parseArgs', () => {
    it('по умолчанию dry-run', () => {
      expect(parseArgs([]).apply).toBe(false)
      expect(parseArgs(['--dry-run']).apply).toBe(false)
    })
    it('--apply включает запись', () => {
      expect(parseArgs(['--apply']).apply).toBe(true)
    })
    it('--apply вместе с --dry-run — ошибка', () => {
      expect(() => parseArgs(['--apply', '--dry-run'])).toThrow()
    })
    it('неизвестный флаг — ошибка', () => {
      expect(() => parseArgs(['--force'])).toThrow(/--force/)
    })
    it('--concurrency принимает целое', () => {
      expect(parseArgs(['--concurrency', '2']).concurrency).toBe(2)
      expect(() => parseArgs(['--concurrency', 'x'])).toThrow()
    })
  })

  it('IMAGE_TARGETS покрывает все известные места с картинками', () => {
    const names = IMAGE_TARGETS.map(key)
    expect(names).toEqual(
      expect.arrayContaining([
        'product_images.url',
        'products.og_image',
        'products.long_description_blocks',
        'products.translations',
        'pages.og_image',
        'pages.blocks',
        'pages.translations',
        'blog_posts.cover_image_url',
        'blog_posts.og_image',
        'blog_posts.blocks',
        'blog_posts.translations',
        'product_categories.translations',
        'site_settings.testimonials',
        'entity_revisions.snapshot',
      ]),
    )
  })
})
