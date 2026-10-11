import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { createApp } from '../../app.js'
import { isValidYcpToken } from './auth.js'
import { YCP_TEST_TOKEN, applyYcpTestEnv, ycpAuth } from './testHelpers.js'

describe('isValidYcpToken', () => {
  it('принимает только точный токен в схеме Bearer', () => {
    expect(isValidYcpToken(`Bearer ${YCP_TEST_TOKEN}`, YCP_TEST_TOKEN)).toBe(true)
    expect(isValidYcpToken(`bearer   ${YCP_TEST_TOKEN}`, YCP_TEST_TOKEN)).toBe(true)
    expect(isValidYcpToken(`Bearer ${YCP_TEST_TOKEN}x`, YCP_TEST_TOKEN)).toBe(false)
    expect(isValidYcpToken(YCP_TEST_TOKEN, YCP_TEST_TOKEN)).toBe(false)
    expect(isValidYcpToken(`Basic ${YCP_TEST_TOKEN}`, YCP_TEST_TOKEN)).toBe(false)
    expect(isValidYcpToken(undefined, YCP_TEST_TOKEN)).toBe(false)
  })

  it('без ожидаемого токена не пускает никого', () => {
    expect(isValidYcpToken('Bearer ', null)).toBe(false)
    expect(isValidYcpToken('Bearer null', null)).toBe(false)
    expect(isValidYcpToken('Bearer undefined', null)).toBe(false)
  })
})

describe('/api/v1 — доступ и формат ошибок', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('401 без заголовка Authorization', async () => {
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
    const res = await request(app).get('/api/v1/warehouses')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('401 с чужим токеном', async () => {
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
    const res = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${'z'.repeat(40)}`)
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('токен не задан в окружении — 401 на любой заголовок', async () => {
    vi.stubEnv('YCP_API_TOKEN', '')
    for (const header of ['Bearer ', 'Bearer undefined', `Bearer ${YCP_TEST_TOKEN}`]) {
      const res = await request(app).get('/api/v1/warehouses').set('Authorization', header)
      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: 'Unauthorized' })
    }
  })

  it('короткий токен в окружении считается незаданным', async () => {
    vi.stubEnv('YCP_API_TOKEN', 'short-token')
    const res = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', 'Bearer short-token')
    expect(res.status).toBe(401)
  })

  it('неизвестный путь с верным токеном — 404 в формате Яндекса', async () => {
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
    const res = await request(app).get('/api/v1/nope').set(ycpAuth)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not found' })
  })

  it('битый JSON — 400 {"error": строка}', async () => {
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
    const res = await request(app)
      .post('/api/v1/checkout')
      .set(ycpAuth)
      .set('Content-Type', 'application/json')
      .send('{"session_id":')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid request format: malformed JSON' })
  })

  it('соседние маршруты не задеты: публичный чекаут отвечает в своём формате', async () => {
    const res = await request(app).post('/api/checkout').send({})
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('validation_error')
  })
})
