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

  it('чекаут: нужен рубильник; test-режим на production — только админу', () => {
    const live = cloudPaymentsConfigFrom(settings(), KEYS)
    const test = cloudPaymentsConfigFrom(settings({ cloudpaymentsMode: 'test' }), KEYS)
    const off = cloudPaymentsConfigFrom(settings({ cloudpaymentsEnabled: false }), KEYS)
    const prod = { NODE_ENV: 'production' }
    expect(isCloudPaymentsCheckoutAvailable(live, prod)).toBe(true)
    expect(isCloudPaymentsCheckoutAvailable(live, prod, { admin: false })).toBe(true)
    expect(isCloudPaymentsCheckoutAvailable(test, prod)).toBe(false)
    expect(isCloudPaymentsCheckoutAvailable(test, prod, { admin: false })).toBe(false)
    expect(isCloudPaymentsCheckoutAvailable(test, prod, { admin: true })).toBe(true)
    expect(isCloudPaymentsCheckoutAvailable(test, { NODE_ENV: 'test' })).toBe(true)
    expect(isCloudPaymentsCheckoutAvailable(off, prod)).toBe(false)
    expect(isCloudPaymentsCheckoutAvailable(off, prod, { admin: true })).toBe(false)
    expect(isCloudPaymentsCheckoutAvailable(null, prod, { admin: true })).toBe(false)
  })

  it('тестовые платежи: на production — только в режиме «Тест»', () => {
    const live = cloudPaymentsConfigFrom(settings(), KEYS)
    const test = cloudPaymentsConfigFrom(settings({ cloudpaymentsMode: 'test' }), KEYS)
    const prod = { NODE_ENV: 'production' }
    expect(acceptsTestPayments(live, prod)).toBe(false)
    expect(acceptsTestPayments(test, prod)).toBe(true)
    expect(acceptsTestPayments(null, prod)).toBe(false)
    expect(acceptsTestPayments(live, { NODE_ENV: 'development' })).toBe(true)
    expect(acceptsTestPayments(null, { NODE_ENV: 'test' })).toBe(true)
  })

  it('публичное значение на production в режиме «Тест» — null (ответ кешируется для всех)', () => {
    expect(
      publicCloudPayments(cloudPaymentsConfigFrom(settings({ cloudpaymentsMode: 'test' }), KEYS), {
        NODE_ENV: 'production',
      }),
    ).toBeNull()
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
