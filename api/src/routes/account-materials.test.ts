import 'reflect-metadata'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { AppDataSource } from '../config/dataSource.js'
import { Customer } from '../entities/Customer.js'
import { MaterialGrant } from '../entities/MaterialGrant.js'
import { setMailerForTests } from '../lib/mail/mailer.js'
import { resetMaterialTables, seedMaterial } from '../lib/materials/testUtils.js'
import { customerHeaders, loginAsCustomer, resetAccountTables } from './testUtils.js'

const binary = (res: NodeJS.ReadableStream, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = []
  res.on('data', (c: Buffer) => chunks.push(c))
  res.on('end', () => cb(null, Buffer.concat(chunks)))
}

describe('материалы в кабинете', () => {
  let app: ReturnType<typeof createApp>
  let dir: string

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    await resetMaterialTables()
    dir = await mkdtemp(path.join(os.tmpdir(), 'materials-'))
    vi.stubEnv('MATERIALS_DIR', dir)
    app = createApp()
  })
  afterEach(async () => {
    setMailerForTests(null)
    vi.unstubAllEnvs()
    await rm(dir, { recursive: true, force: true })
  })

  const me = () =>
    AppDataSource.getRepository(Customer).findOneByOrFail({ email: 'buyer@test.local' })
  const grant = (materialId: string, over: Partial<MaterialGrant>) =>
    AppDataSource.getRepository(MaterialGrant).save(
      AppDataSource.getRepository(MaterialGrant).create({ materialId, source: 'order', ...over }),
    )

  describe('GET /api/account/materials', () => {
    it('без сессии — 401', async () => {
      expect((await request(app).get('/api/account/materials')).status).toBe(401)
    })

    it('отдаёт свои действующие материалы; файл без url, ссылка с url; путей к файлам нет', async () => {
      const auth = await loginAsCustomer(app)
      const c = await me()
      const file = await seedMaterial({ title: 'Методичка', fileKey: 'm.pdf' })
      const link = await seedMaterial({
        title: 'Видео',
        kind: 'link',
        externalUrl: 'https://example.com/v',
      })
      await grant(file.id, { customerId: c.id })
      await grant(link.id, { customerId: c.id })

      const res = await request(app).get('/api/account/materials').set(customerHeaders(auth))

      expect(res.status).toBe(200)
      const byTitle = new Map(res.body.data.map((m: { title: string }) => [m.title, m]))
      expect(byTitle.get('Методичка')).toMatchObject({
        id: file.id,
        kind: 'file',
        fileName: 'm.pdf',
        sizeBytes: 5,
      })
      expect(byTitle.get('Методичка')).not.toHaveProperty('url')
      expect(byTitle.get('Видео')).toMatchObject({ kind: 'link', url: 'https://example.com/v' })
      expect(typeof (byTitle.get('Методичка') as { grantedAt: string }).grantedAt).toBe('string')
      expect(JSON.stringify(res.body)).not.toContain('file_key')
      expect(JSON.stringify(res.body)).not.toContain('fileKey')
    })

    it('чужие, отозванные и неактивные материалы не показываются', async () => {
      const auth = await loginAsCustomer(app)
      const c = await me()
      const stranger = await AppDataSource.getRepository(Customer).save({ email: 'x@y.ru' })
      const mine = await seedMaterial({ title: 'Моя', fileKey: 'a.pdf' })
      const foreign = await seedMaterial({ title: 'Чужая', fileKey: 'b.pdf' })
      const revoked = await seedMaterial({ title: 'Отозванная', fileKey: 'c.pdf' })
      const off = await seedMaterial({ title: 'Выключена', fileKey: 'd.pdf', isActive: false })
      await grant(mine.id, { customerId: c.id })
      await grant(foreign.id, { customerId: stranger.id })
      await grant(revoked.id, { customerId: c.id, revokedAt: new Date() })
      await grant(off.id, { customerId: c.id })

      const res = await request(app).get('/api/account/materials').set(customerHeaders(auth))

      expect(res.body.data.map((m: { title: string }) => m.title)).toEqual(['Моя'])
    })

    it('один материал из двух заказов — одна строка', async () => {
      const auth = await loginAsCustomer(app)
      const c = await me()
      const m = await seedMaterial({ title: 'Методичка', fileKey: 'a.pdf' })
      await grant(m.id, { customerId: c.id, email: 'a@x.ru' })
      await grant(m.id, { customerId: c.id, email: 'b@x.ru', source: 'admin' })

      const res = await request(app).get('/api/account/materials').set(customerHeaders(auth))

      expect(res.body.data).toHaveLength(1)
    })

    it('выдача по email без аккаунта появляется после входа с этим email', async () => {
      const m = await seedMaterial({ title: 'Методичка', fileKey: 'a.pdf' })
      await grant(m.id, { email: 'buyer@test.local', source: 'admin' })

      const auth = await loginAsCustomer(app, 'buyer@test.local')
      const res = await request(app).get('/api/account/materials').set(customerHeaders(auth))

      expect(res.body.data.map((x: { id: string }) => x.id)).toEqual([m.id])
    })
  })

  describe('GET /api/account/materials/:materialId/download', () => {
    async function granted(over: { isActive?: boolean; revoked?: boolean } = {}) {
      const auth = await loginAsCustomer(app)
      const c = await me()
      const m = await seedMaterial({
        title: 'Методичка',
        fileKey: 'a.pdf',
        isActive: over.isActive,
      })
      await grant(m.id, { customerId: c.id, ...(over.revoked ? { revokedAt: new Date() } : {}) })
      return { auth, m }
    }

    it('без сессии — 401', async () => {
      const m = await seedMaterial({ title: 'Методичка', fileKey: 'a.pdf' })
      expect((await request(app).get(`/api/account/materials/${m.id}/download`)).status).toBe(401)
    })

    it('владельцу отдаёт файл с заголовками закрытой раздачи', async () => {
      await writeFile(path.join(dir, 'a.pdf'), '%PDF-owner')
      const { auth, m } = await granted()

      const res = await request(app)
        .get(`/api/account/materials/${m.id}/download`)
        .set(customerHeaders(auth))
        .buffer(true)
        .parse(binary)

      expect(res.status).toBe(200)
      expect(res.body.toString()).toBe('%PDF-owner')
      expect(res.headers['content-disposition']).toMatch(/^attachment;/)
      expect(res.headers['cache-control']).toBe('private, no-store')
    })

    it('чужой покупатель — 404', async () => {
      await writeFile(path.join(dir, 'a.pdf'), '%PDF-owner')
      const { m } = await granted()
      const other = await loginAsCustomer(app, 'other@test.local')

      const res = await request(app)
        .get(`/api/account/materials/${m.id}/download`)
        .set(customerHeaders(other))

      expect(res.status).toBe(404)
      expect(res.text).not.toContain('PDF-owner')
    })

    it('отозванная выдача и неактивный материал — 404', async () => {
      await writeFile(path.join(dir, 'a.pdf'), 'x')
      for (const over of [{ revoked: true }, { isActive: false }]) {
        // Повторный вход с тем же email упёрся бы в минутный лимит кода.
        await resetAccountTables()
        await resetMaterialTables()
        const { auth, m } = await granted(over)
        const res = await request(app)
          .get(`/api/account/materials/${m.id}/download`)
          .set(customerHeaders(auth))
        expect(res.status).toBe(404)
      }
    })

    it('не-uuid в пути — 404, а не 500', async () => {
      const auth = await loginAsCustomer(app)
      const res = await request(app)
        .get('/api/account/materials/not-a-uuid/download')
        .set(customerHeaders(auth))
      expect(res.status).toBe(404)
    })

    it('файл исчез с диска — 404 material_file_missing', async () => {
      const { auth, m } = await granted()

      const res = await request(app)
        .get(`/api/account/materials/${m.id}/download`)
        .set(customerHeaders(auth))

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('material_file_missing')
    })

    it('материал-ссылка скачивания не имеет — 404', async () => {
      const auth = await loginAsCustomer(app)
      const c = await me()
      const link = await seedMaterial({ title: 'Видео', kind: 'link' })
      await grant(link.id, { customerId: c.id })

      const res = await request(app)
        .get(`/api/account/materials/${link.id}/download`)
        .set(customerHeaders(auth))

      expect(res.status).toBe(404)
    })
  })
})
