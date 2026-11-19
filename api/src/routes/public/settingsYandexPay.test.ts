import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { SiteSettings } from '../../entities/SiteSettings.js'
import { createApp } from '../../app.js'

const MERCHANT = '00000000-aaaa-bbbb-cccc-000000000001'
const API_KEY = 'test-api-key-not-real'

const setYandex = (yandexPayEnabled: boolean, yandexPayMode: 'sandbox' | 'production') =>
  AppDataSource.getRepository(SiteSettings).save({ id: 'default', yandexPayEnabled, yandexPayMode })

describe('GET /api/public/settings: yandexPay', () => {
  const app = createApp()
  const get = () => request(app).get('/api/public/settings')

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    vi.stubEnv('YANDEX_PAY_MERCHANT_ID', MERCHANT)
    vi.stubEnv('YANDEX_PAY_API_KEY', API_KEY)
    await setYandex(true, 'production')
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await setYandex(false, 'sandbox')
  })

  it('боевой режим — Сплит и Merchant ID; ключа API в ответе нет', async () => {
    const res = await get()
    expect(res.body.data.yandexPay).toEqual({ split: true, merchantId: MERCHANT })
    expect(res.text).not.toContain(API_KEY)
  })

  it('выключен рубильник, нет Merchant ID или ключа боевого режима — null', async () => {
    await setYandex(false, 'production')
    expect((await get()).body.data.yandexPay).toBeNull()
    await setYandex(true, 'production')
    vi.stubEnv('YANDEX_PAY_API_KEY', '')
    expect((await get()).body.data.yandexPay).toBeNull()
    vi.stubEnv('YANDEX_PAY_MERCHANT_ID', '')
    expect((await get()).body.data.yandexPay).toBeNull()
  })

  it('песочница: вне прода — без Merchant ID (он же ключ); при NODE_ENV=production — null', async () => {
    await setYandex(true, 'sandbox')
    const res = await get()
    expect(res.body.data.yandexPay).toEqual({ split: true })
    expect(res.text).not.toContain(MERCHANT)
    vi.stubEnv('NODE_ENV', 'production')
    expect((await get()).body.data.yandexPay).toBeNull()
  })
})
