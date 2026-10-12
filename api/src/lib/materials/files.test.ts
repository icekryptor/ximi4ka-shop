import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LearningMaterial } from '../../entities/LearningMaterial.js'
import { materialsDir, resolveMaterialPath, sendMaterialFile } from './files.js'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'materials-'))
  vi.stubEnv('MATERIALS_DIR', dir)
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
})
