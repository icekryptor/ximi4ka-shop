import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { createApp } from '../../app.js'
import { applyYcpTestEnv, ycpAuth } from './testHelpers.js'

const WAREHOUSE = {
  id: 'msk-1',
  title: 'Склад Химички',
  address: 'Москва, ул. Примерная, 1',
  phone: '+7 (495) 000-00-00',
  self_pickup_options: { enabled: false },
  ycp_delivery_options: { enabled: false },
}

describe('GET /api/v1/warehouses', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(() => {
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('отдаёт единственный склад из окружения', async () => {
    const res = await request(app).get('/api/v1/warehouses?limit=1000&offset=0').set(ycpAuth)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ warehouses: [WAREHOUSE], total_count: 1 })
  })

  it('без limit и offset — первая страница', async () => {
    const res = await request(app).get('/api/v1/warehouses').set(ycpAuth)
    expect(res.body).toEqual({ warehouses: [WAREHOUSE], total_count: 1 })
  })

  it('offset за концом списка — пустая страница, total_count прежний', async () => {
    const res = await request(app).get('/api/v1/warehouses?limit=10&offset=1').set(ycpAuth)
    expect(res.body).toEqual({ warehouses: [], total_count: 1 })
  })

  it('нечисловой limit — 400', async () => {
    const res = await request(app).get('/api/v1/warehouses?limit=abc&offset=0').set(ycpAuth)
    expect(res.status).toBe(400)
    expect(typeof res.body.error).toBe('string')
  })

  it('склад не настроен — 500 в формате Яндекса', async () => {
    vi.stubEnv('YCP_WAREHOUSE_ADDRESS', '')
    const res = await request(app).get('/api/v1/warehouses').set(ycpAuth)
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Warehouse is not configured' })
  })
})
