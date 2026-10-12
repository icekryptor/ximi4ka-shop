import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LearningMaterial } from '../../entities/LearningMaterial.js'
import { isClientAbort, materialsDir, resolveMaterialPath, sendMaterialFile } from './files.js'

// Швы для проверки обработки ошибок потока: логгер pino подменён шпионом, а open()
// при включённом failRead отдаёт поток, который падает на первом же чтении.
const seam = vi.hoisted(() => ({
  logError: vi.fn(),
  failRead: null as null | { code: string },
}))

vi.mock('pino', () => {
  const logger = { error: seam.logError, child: () => logger }
  return { default: () => logger }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const fh = await actual.open(...args)
      const failure = seam.failRead
      if (failure) {
        fh.createReadStream = (() =>
          new Readable({
            read() {
              this.destroy(Object.assign(new Error(failure.code), { code: failure.code }))
            },
            destroy(err, cb) {
              fh.close().then(() => cb(err), cb)
            },
          })) as typeof fh.createReadStream
      }
      return fh
    },
  }
})

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'materials-'))
  vi.stubEnv('MATERIALS_DIR', dir)
  seam.logError.mockClear()
  seam.failRead = null
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(dir, { recursive: true, force: true })
})

const material = (over: Partial<LearningMaterial> = {}) =>
  ({
    kind: 'file',
    fileKey: 'a.pdf',
    fileName: 'a.pdf',
    mimeType: 'application/pdf',
    ...over,
  }) as LearningMaterial

const binary = (res: NodeJS.ReadableStream, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = []
  res.on('data', (c: Buffer) => chunks.push(c))
  res.on('end', () => cb(null, Buffer.concat(chunks)))
}

function appFor(m: LearningMaterial) {
  const app = express()
  app.get('/f', async (_req, res) => {
    if (!(await sendMaterialFile(res, m))) res.status(404).json({ ok: false })
  })
  return app
}

describe('materialsDir', () => {
  it('берёт каталог из MATERIALS_DIR', () => {
    expect(materialsDir()).toBe(dir)
  })
})

describe('resolveMaterialPath', () => {
  it('принимает обычное имя файла', () => {
    expect(resolveMaterialPath('a.pdf')).toBe(path.join(dir, 'a.pdf'))
  })

  it.each(['../a.pdf', 'a/b.pdf', '/etc/passwd', '..', '.hidden', '', 'a\0b'])(
    'отвергает %j',
    (key) => {
      expect(resolveMaterialPath(key)).toBeNull()
    },
  )
})

describe('sendMaterialFile', () => {
  it('отдаёт файл с заголовками закрытой раздачи', async () => {
    await writeFile(path.join(dir, 'a.pdf'), '%PDF-1.4 test')
    const res = await request(appFor(material({ fileName: 'Методичка.pdf' })))
      .get('/f')
      .buffer(true)
      .parse(binary)

    expect(res.status).toBe(200)
    expect(res.body.toString()).toBe('%PDF-1.4 test')
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['content-length']).toBe('13')
    expect(res.headers['cache-control']).toBe('private, no-store')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    const cd = res.headers['content-disposition'] as string
    expect(cd).toMatch(/^attachment; filename="[^"]*\.pdf"; filename\*=UTF-8''/)
    expect(decodeURIComponent(cd.split("filename*=UTF-8''")[1])).toBe('Методичка.pdf')
  })

  it('без mime_type отдаёт application/octet-stream', async () => {
    await writeFile(path.join(dir, 'a.pdf'), 'x')
    const res = await request(appFor(material({ mimeType: null })))
      .get('/f')
      .buffer(true)
      .parse(binary)
    expect(res.headers['content-type']).toBe('application/octet-stream')
  })

  it('файла нет на диске — false, ничего не отправлено', async () => {
    const res = await request(appFor(material())).get('/f')
    expect(res.status).toBe(404)
    expect(res.headers['content-disposition']).toBeUndefined()
  })

  it('запись без file_key (ссылка) — false', async () => {
    const res = await request(appFor(material({ kind: 'link', fileKey: null }))).get('/f')
    expect(res.status).toBe(404)
  })

  it('file_key с выходом за каталог не отдаётся, даже если файл существует', async () => {
    await writeFile(path.join(path.dirname(dir), 'outside-secret.txt'), 'secret')
    try {
      const res = await request(appFor(material({ fileKey: '../outside-secret.txt' }))).get('/f')
      expect(res.status).toBe(404)
      expect(res.text).not.toContain('secret')
    } finally {
      await rm(path.join(path.dirname(dir), 'outside-secret.txt'), { force: true })
    }
  })

  it('вместо файла каталог — false', async () => {
    await mkdir(path.join(dir, 'a.pdf'))
    const res = await request(appFor(material())).get('/f')
    expect(res.status).toBe(404)
  })

  it.skipIf(process.getuid?.() === 0)(
    'файл есть, но не открывается (нет прав) — false, ничего не отправлено',
    async () => {
      const file = path.join(dir, 'a.pdf')
      await writeFile(file, 'x')
      await chmod(file, 0o000)
      const res = await request(appFor(material())).get('/f')
      expect(res.status).toBe(404)
      expect(res.headers['content-disposition']).toBeUndefined()
      expect(res.headers['content-length']).not.toBe('1')
    },
  )

  describe('ошибки потока', () => {
    // Приложение с записью результата sendMaterialFile; запрос из-за обрыва тела
    // завершается ошибкой клиента — это ожидаемо, сам результат берём из замера.
    async function download(): Promise<boolean | undefined> {
      let result: boolean | undefined
      const app = express()
      app.get('/f', async (_req, res) => {
        result = await sendMaterialFile(res, material())
      })
      await writeFile(path.join(dir, 'a.pdf'), 'x'.repeat(1000))
      await request(app)
        .get('/f')
        .buffer(true)
        .parse(binary)
        .then(
          () => undefined,
          () => undefined,
        )
      return result
    }

    it('реальная ошибка чтения (EIO) логируется, функция возвращает true', async () => {
      seam.failRead = { code: 'EIO' }
      expect(await download()).toBe(true)
      expect(seam.logError).toHaveBeenCalledTimes(1)
      const [fields] = seam.logError.mock.calls[0]
      expect((fields.err as NodeJS.ErrnoException).code).toBe('EIO')
      expect(fields.fileKey).toBe('a.pdf')
    })

    it('обрыв клиента (ERR_STREAM_PREMATURE_CLOSE) не логируется, возвращает true', async () => {
      seam.failRead = { code: 'ERR_STREAM_PREMATURE_CLOSE' }
      expect(await download()).toBe(true)
      expect(seam.logError).not.toHaveBeenCalled()
    })
  })
})

describe('isClientAbort', () => {
  it.each(['ERR_STREAM_PREMATURE_CLOSE', 'ECONNRESET', 'ERR_STREAM_DESTROYED'])(
    '%s — обрыв клиента',
    (code) => {
      expect(isClientAbort(Object.assign(new Error(code), { code }))).toBe(true)
    },
  )

  it('AbortError — обрыв клиента', () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    expect(isClientAbort(err)).toBe(true)
  })

  it.each([
    Object.assign(new Error('io'), { code: 'EIO' }),
    Object.assign(new Error('gone'), { code: 'ENOENT' }),
    new Error('generic'),
    'строка',
    undefined,
  ])('%j — реальная ошибка', (err) => {
    expect(isClientAbort(err)).toBe(false)
  })
})
