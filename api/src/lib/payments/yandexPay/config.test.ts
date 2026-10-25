import { describe, it, expect } from 'vitest'
import {
  hasYandexPayMerchant,
  isCheckoutAvailable,
  publicYandexPay,
  yandexPayConfigFrom,
} from './config.js'

const MERCHANT = '00000000-aaaa-bbbb-cccc-000000000001'
const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv
const on = (mode: 'sandbox' | 'production') => ({ yandexPayEnabled: true, yandexPayMode: mode })

describe('yandexPayConfigFrom', () => {
  it('без Merchant ID — null; хост, JWKS и ключ — по режиму', () => {
    expect(yandexPayConfigFrom(on('production'), env({}))).toBeNull()
    expect(yandexPayConfigFrom(on('production'), env({ YANDEX_PAY_MERCHANT_ID: '  ' }))).toBeNull()
    expect(
      yandexPayConfigFrom(
        on('production'),
        env({ YANDEX_PAY_MERCHANT_ID: ` ${MERCHANT} `, YANDEX_PAY_API_KEY: 'k' }),
      ),
    ).toEqual({
      merchantId: MERCHANT,
      apiKey: 'k',
      authKey: 'k',
      mode: 'production',
      enabled: true,
      baseUrl: 'https://pay.yandex.ru',
      jwksUrl: 'https://pay.yandex.ru/api/jwks',
    })
    expect(
      yandexPayConfigFrom(on('sandbox'), env({ YANDEX_PAY_MERCHANT_ID: MERCHANT })),
    ).toMatchObject({
      authKey: MERCHANT,
      baseUrl: 'https://sandbox.pay.yandex.ru',
      jwksUrl: 'https://sandbox.pay.yandex.ru/api/jwks',
    })
  })

  it('неизвестный режим в базе считается песочницей', () => {
    const cfg = yandexPayConfigFrom(
      { yandexPayEnabled: true, yandexPayMode: 'live' },
      env({ YANDEX_PAY_MERCHANT_ID: MERCHANT }),
    )
    expect(cfg?.mode).toBe('sandbox')
  })

  it('hasYandexPayMerchant — по одному Merchant ID', () => {
    expect(hasYandexPayMerchant(env({ YANDEX_PAY_MERCHANT_ID: MERCHANT }))).toBe(true)
    expect(hasYandexPayMerchant(env({ YANDEX_PAY_MERCHANT_ID: '' }))).toBe(false)
  })
})

describe('isCheckoutAvailable и publicYandexPay', () => {
  const prod = env({
    YANDEX_PAY_MERCHANT_ID: MERCHANT,
    YANDEX_PAY_API_KEY: 'k',
    NODE_ENV: 'production',
  })

  it('боевой режим: нужен ключ API; Merchant ID отдаётся витрине', () => {
    const cfg = yandexPayConfigFrom(on('production'), prod)
    expect(isCheckoutAvailable(cfg, prod)).toBe(true)
    expect(publicYandexPay(cfg, prod)).toEqual({ split: true, merchantId: MERCHANT })
    const noKey = env({ YANDEX_PAY_MERCHANT_ID: MERCHANT, NODE_ENV: 'production' })
    expect(isCheckoutAvailable(yandexPayConfigFrom(on('production'), noKey), noKey)).toBe(false)
  })

  it('рубильник выключен — недоступен', () => {
    const cfg = yandexPayConfigFrom({ yandexPayEnabled: false, yandexPayMode: 'production' }, prod)
    expect(isCheckoutAvailable(cfg, prod)).toBe(false)
    expect(publicYandexPay(cfg, prod)).toBeNull()
    expect(publicYandexPay(null, prod)).toBeNull()
  })

  it('песочница — только не на проде, и без Merchant ID (он же ключ)', () => {
    const dev = env({ YANDEX_PAY_MERCHANT_ID: MERCHANT, NODE_ENV: 'development' })
    const sandboxDev = yandexPayConfigFrom(on('sandbox'), dev)
    expect(isCheckoutAvailable(sandboxDev, dev)).toBe(true)
    expect(publicYandexPay(sandboxDev, dev)).toEqual({ split: true })
    const sandboxProd = yandexPayConfigFrom(on('sandbox'), prod)
    expect(isCheckoutAvailable(sandboxProd, prod)).toBe(false)
    expect(publicYandexPay(sandboxProd, prod)).toBeNull()
  })
})
