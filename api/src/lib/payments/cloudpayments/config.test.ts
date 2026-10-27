import { describe, expect, it } from 'vitest'
import {
  acceptsTestPayments,
  cloudPaymentsConfigFrom,
  hasCloudPaymentsKeys,
  isCloudPaymentsCheckoutAvailable,
  publicCloudPayments,
} from './config.js'

const KEYS = { CLOUDPAYMENTS_PUBLIC_ID: 'pk_test', CLOUDPAYMENTS_API_SECRET: 'secret_test' }
const settings = (over: Partial<Record<string, unknown>> = {}) => ({
  cloudpaymentsEnabled: true,
  cloudpaymentsMode: 'live',
  cloudpaymentsSurchargePercent: 8,
  ...over,
})

describe('cloudpayments config', () => {
  it('без обоих ключей конфигурации нет', () => {
    expect(hasCloudPaymentsKeys({ CLOUDPAYMENTS_PUBLIC_ID: 'pk' })).toBe(false)
    expect(cloudPaymentsConfigFrom(settings(), { CLOUDPAYMENTS_API_SECRET: 's' })).toBeNull()
  })

  it('ключи обрезаются, режим и процент — из настроек', () => {
    const cfg = cloudPaymentsConfigFrom(settings(), {
      CLOUDPAYMENTS_PUBLIC_ID: ' pk_test ',
      CLOUDPAYMENTS_API_SECRET: ' secret_test ',
    })
    expect(cfg).toEqual({
      publicId: 'pk_test',
      apiSecret: 'secret_test',
      mode: 'live',
      enabled: true,
      surchargePercent: 8,
    })
  })

  it('неизвестный режим — test; процент вне 0…15 или дробный — 0 или потолок', () => {
    expect(cloudPaymentsConfigFrom(settings({ cloudpaymentsMode: 'prod' }), KEYS)?.mode).toBe(
      'test',
    )
    expect(
      cloudPaymentsConfigFrom(settings({ cloudpaymentsSurchargePercent: -1 }), KEYS)
        ?.surchargePercent,
    ).toBe(0)
    expect(
      cloudPaymentsConfigFrom(settings({ cloudpaymentsSurchargePercent: 7.5 }), KEYS)
        ?.surchargePercent,
    ).toBe(0)
    expect(
      cloudPaymentsConfigFrom(settings({ cloudpaymentsSurchargePercent: 40 }), KEYS)
        ?.surchargePercent,
    ).toBe(15)
  })

  it('чекаут: нужен рубильник; test-режим — только вне production', () => {
    const live = cloudPaymentsConfigFrom(settings(), KEYS)
    const test = cloudPaymentsConfigFrom(settings({ cloudpaymentsMode: 'test' }), KEYS)
    const off = cloudPaymentsConfigFrom(settings({ cloudpaymentsEnabled: false }), KEYS)
    const prod = { NODE_ENV: 'production' }
    expect(isCloudPaymentsCheckoutAvailable(live, prod)).toBe(true)
    expect(isCloudPaymentsCheckoutAvailable(test, prod)).toBe(false)
    expect(isCloudPaymentsCheckoutAvailable(test, { NODE_ENV: 'test' })).toBe(true)
    expect(isCloudPaymentsCheckoutAvailable(off, prod)).toBe(false)
    expect(isCloudPaymentsCheckoutAvailable(null, prod)).toBe(false)
  })

  it('тестовые платежи не принимаются на production', () => {
    expect(acceptsTestPayments({ NODE_ENV: 'production' })).toBe(false)
    expect(acceptsTestPayments({ NODE_ENV: 'development' })).toBe(true)
  })

  it('публичное значение: только процент, null — если недоступен', () => {
    const prod = { NODE_ENV: 'production' }
    expect(publicCloudPayments(cloudPaymentsConfigFrom(settings(), KEYS), prod)).toEqual({
      surchargePercent: 8,
    })
    expect(
      publicCloudPayments(
        cloudPaymentsConfigFrom(settings({ cloudpaymentsEnabled: false }), KEYS),
        prod,
      ),
    ).toBeNull()
  })
})
