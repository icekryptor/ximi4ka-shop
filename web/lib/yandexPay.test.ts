import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ getPublicSettings: vi.fn() }))
vi.mock('@/lib/api', () => api)

import {
  PAYMENT_METHOD_LABELS,
  isYandexMethod,
  loadPublicYandexPay,
  reloadPublicYandexPay,
  resetPublicYandexPayCacheForTests,
  splitBadgeAmount,
} from './yandexPay'

beforeEach(() => {
  resetPublicYandexPayCacheForTests()
  api.getPublicSettings.mockReset()
})

describe('подписи и сумма плашки', () => {
  it('подписи способов и признак Яндекса', () => {
    expect(PAYMENT_METHOD_LABELS).toEqual({
      tbank: 'Картой — Т-Банк',
      yandex_pay: 'Яндекс Пэй',
      yandex_split: 'Сплит — оплата частями',
      cloudpayments: 'Visa / Mastercard банка другой страны',
    })
    expect(isYandexMethod('yandex_split')).toBe(true)
    expect(isYandexMethod('tbank')).toBe(false)
  })

  it('сумма — строка с двумя знаками; 0, минус, NaN и бесконечность — плашки нет', () => {
    expect(splitBadgeAmount(2490)).toBe('2490.00')
    expect(splitBadgeAmount(2490.5)).toBe('2490.50')
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(splitBadgeAmount(bad)).toBeNull()
  })
})

describe('yandexPay из публичных настроек', () => {
  it('один запрос на сессию; reload спрашивает заново', async () => {
    api.getPublicSettings
      .mockResolvedValueOnce({ yandexPay: { split: true, merchantId: 'm-1' } })
      .mockResolvedValueOnce({ yandexPay: null })
    expect(await loadPublicYandexPay()).toEqual({ split: true, merchantId: 'm-1' })
    expect(await loadPublicYandexPay()).toEqual({ split: true, merchantId: 'm-1' })
    expect(api.getPublicSettings).toHaveBeenCalledTimes(1)
    expect(await reloadPublicYandexPay()).toBeNull()
    expect(api.getPublicSettings).toHaveBeenCalledTimes(2)
  })

  it('сбой api, нет поля или пустой ответ — null без исключения', async () => {
    api.getPublicSettings.mockRejectedValueOnce(new Error('down'))
    expect(await loadPublicYandexPay()).toBeNull()
    api.getPublicSettings.mockResolvedValueOnce({})
    expect(await reloadPublicYandexPay()).toBeNull()
    api.getPublicSettings.mockReturnValueOnce(undefined)
    expect(await reloadPublicYandexPay()).toBeNull()
  })
})
