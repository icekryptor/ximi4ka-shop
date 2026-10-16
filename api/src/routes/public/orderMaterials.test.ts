import 'reflect-metadata'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app.js'
import { AppDataSource } from '../../config/dataSource.js'
import { MaterialGrant } from '../../entities/MaterialGrant.js'
import { grantMaterialsForOrder } from '../../lib/materials/grants.js'
import {
  addOrderItem,
  resetMaterialTables,
  seedMaterial,
  seedProduct,
} from '../../lib/materials/testUtils.js'
import { resetAccountTables, seedOrder } from '../testUtils.js'

const binary = (res: NodeJS.ReadableStream, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = []
  res.on('data', (c: Buffer) => chunks.push(c))
  res.on('end', () => cb(null, Buffer.concat(chunks)))
}

describe('материалы на странице заказа', () => {
  const app = createApp()
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
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await rm(dir, { recursive: true, force: true })
  })

  // Заказ с набором; выдача создаётся так же, как при оплате.
  async function orderWithMaterial(opts: { paid: boolean }) {
    const kit = await seedProduct('himichka-30')
    const material = await seedMaterial({ title: 'Химичка', fileKey: 'a.pdf', products: [kit] })
    const order = await seedOrder({
      status: opts.paid ? 'paid' : 'pending',
      paymentProvider: 'tbank',
    })
    await addOrderItem(order.id, kit)
    if (opts.paid) await grantMaterialsForOrder(AppDataSource.manager, order)
    return { order, material }
  }

  const status = (number: string, t?: string) =>
    request(app)
      .get(`/api/public/orders/${number}/status`)
      .query(t ? { t } : {})

  describe('статус заказа', () => {
    it('с верным токеном отдаёт материалы оплаченного заказа без путей к файлам', async () => {
      const { order, material } = await orderWithMaterial({ paid: true })

      const res = await status(order.orderNumber, order.publicToken)

      expect(res.status).toBe(200)
      expect(res.body.data.materials).toEqual([{ id: material.id, title: 'Химичка', kind: 'file' }])
      expect(JSON.stringify(res.body)).not.toContain('a.pdf')
    })

    it('без токена и с чужим токеном поля materials нет', async () => {
      const { order } = await orderWithMaterial({ paid: true })

      const bare = await status(order.orderNumber)
      const wrong = await status(order.orderNumber, 'x'.repeat(order.publicToken.length))

      expect(bare.body.data).not.toHaveProperty('materials')
      expect(wrong.body.data).not.toHaveProperty('materials')
    })

    it('неоплаченный заказ: список пуст', async () => {
      const { order } = await orderWithMaterial({ paid: false })

      const res = await status(order.orderNumber, order.publicToken)

      expect(res.body.data.materials).toEqual([])
    })

    it('после отмены оплаченного заказа материалы остаются', async () => {
      const { order, material } = await orderWithMaterial({ paid: true })
      await AppDataSource.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [order.id])

      const res = await status(order.orderNumber, order.publicToken)

      expect(res.body.data.materials.map((m: { id: string }) => m.id)).toEqual([material.id])
    })

    it('отозванная выдача не показывается', async () => {
      const { order } = await orderWithMaterial({ paid: true })
      await AppDataSource.getRepository(MaterialGrant).update(
        { orderId: order.id },
        { revokedAt: new Date() },
      )

      const res = await status(order.orderNumber, order.publicToken)

      expect(res.body.data.materials).toEqual([])
    })

    it('материал-ссылка приходит с url', async () => {
      const kit = await seedProduct('himichka-30')
      await seedMaterial({
        title: 'Видео',
        kind: 'link',
        externalUrl: 'https://example.com/v',
        products: [kit],
      })
      const order = await seedOrder({ status: 'paid', paymentProvider: 'tbank' })
      await addOrderItem(order.id, kit)
      await grantMaterialsForOrder(AppDataSource.manager, order)

      const res = await status(order.orderNumber, order.publicToken)

      expect(res.body.data.materials).toMatchObject([
        { kind: 'link', url: 'https://example.com/v' },
      ])
    })
  })

  describe('скачивание по токену заказа', () => {
    const url = (number: string, materialId: string) =>
      `/api/public/orders/${number}/materials/${materialId}/download`

    it('верный токен и выдача — отдаёт файл', async () => {
      await writeFile(path.join(dir, 'a.pdf'), '%PDF-guest')
      const { order, material } = await orderWithMaterial({ paid: true })

      const res = await request(app)
        .get(url(order.orderNumber, material.id))
        .query({ t: order.publicToken })
        .buffer(true)
        .parse(binary)

      expect(res.status).toBe(200)
      expect(res.body.toString()).toBe('%PDF-guest')
      expect(res.headers['content-disposition']).toMatch(/^attachment;/)
      expect(res.headers['cache-control']).toBe('private, no-store')
    })

    it('без токена и с чужим токеном — 404', async () => {
      await writeFile(path.join(dir, 'a.pdf'), '%PDF-guest')
      const { order, material } = await orderWithMaterial({ paid: true })

      const bare = await request(app).get(url(order.orderNumber, material.id))
      const wrong = await request(app)
        .get(url(order.orderNumber, material.id))
        .query({ t: 'x'.repeat(order.publicToken.length) })

      expect(bare.status).toBe(404)
      expect(wrong.status).toBe(404)
    })

    it('неоплаченный заказ (выдачи нет) — 404', async () => {
      await writeFile(path.join(dir, 'a.pdf'), 'x')
      const { order, material } = await orderWithMaterial({ paid: false })

      const res = await request(app)
        .get(url(order.orderNumber, material.id))
        .query({ t: order.publicToken })

      expect(res.status).toBe(404)
    })

    it('материал из чужого заказа — 404', async () => {
      await writeFile(path.join(dir, 'a.pdf'), 'x')
      const { material } = await orderWithMaterial({ paid: true })
      const other = await seedOrder({ status: 'paid', paymentProvider: 'tbank' })

      const res = await request(app)
        .get(url(other.orderNumber, material.id))
        .query({ t: other.publicToken })

      expect(res.status).toBe(404)
    })

    it('не-uuid — 404, файл исчез с диска — 404 material_file_missing', async () => {
      const { order, material } = await orderWithMaterial({ paid: true })

      const bad = await request(app)
        .get(url(order.orderNumber, 'not-a-uuid'))
        .query({ t: order.publicToken })
      const missing = await request(app)
        .get(url(order.orderNumber, material.id))
        .query({ t: order.publicToken })

      expect(bad.status).toBe(404)
      expect(missing.status).toBe(404)
      expect(missing.body.error.code).toBe('material_file_missing')
    })
  })
})
