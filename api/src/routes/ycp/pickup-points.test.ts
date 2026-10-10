import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { createApp } from '../../app.js'
import { setPickupPointsForTests } from '../../lib/ycp/pickupPoints.js'
import { applyYcpTestEnv, makePickupEntry, ycpAuth } from './testHelpers.js'

const URL = '/api/v1/checkout/delivery/pickup_points'

describe('GET /api/v1/checkout/delivery/pickup_points', () => {
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
    setPickupPointsForTests(null)
  })

  it('кеш ещё не собран — 500, Яндекс повторит', async () => {
    const res = await request(app).get(`${URL}?limit=1000&offset=0`).set(ycpAuth)
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Pickup points are not loaded yet' })
  })

  it('режет кеш по limit и offset, total_count — весь список', async () => {
    setPickupPointsForTests([makePickupEntry('A1'), makePickupEntry('B2'), makePickupEntry('C3')])
    const res = await request(app).get(`${URL}?limit=2&offset=1`).set(ycpAuth)
    expect(res.status).toBe(200)
    expect(res.body.total_count).toBe(3)
    expect(res.body.pickup_points.map((p: { id: string }) => p.id)).toEqual(['B2', 'C3'])
    expect(res.body.pickup_points[0]).toEqual(makePickupEntry('B2').point)
  })

  it('без limit и offset — первая тысяча', async () => {
    setPickupPointsForTests([makePickupEntry('A1')])
    const res = await request(app).get(URL).set(ycpAuth)
    expect(res.body).toEqual({ pickup_points: [makePickupEntry('A1').point], total_count: 1 })
  })
})
