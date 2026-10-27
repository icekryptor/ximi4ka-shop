import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  getPublicSettings: vi.fn(),
  getCloudPaymentsCheckoutPreview: vi.fn(),
}))
import { getCloudPaymentsCheckoutPreview, getPublicSettings } from '@/lib/api'
import {
  isCloudPaymentsPreviewRequested,
  loadCloudPaymentsAdminPreview,
  loadPublicCloudPayments,
  reloadPublicCloudPayments,
  resetPublicCloudPaymentsCacheForTests,
} from './cloudPayments'

describe('loadPublicCloudPayments', () => {
  afterEach(() => {
    resetPublicCloudPaymentsCacheForTests()
    vi.mocked(getPublicSettings).mockReset()
  })

  it('берёт cloudPayments из публичных настроек и кеширует на сессию', async () => {
    vi.mocked(getPublicSettings).mockResolvedValue({
      cloudPayments: { surchargePercent: 8 },
    } as never)
    expect(await loadPublicCloudPayments()).toEqual({ surchargePercent: 8 })
    await loadPublicCloudPayments()
    expect(getPublicSettings).toHaveBeenCalledTimes(1)
  })

  it('reload спрашивает заново мимо HTTP-кеша и обновляет кеш сессии', async () => {
    vi.mocked(getPublicSettings)
      .mockResolvedValueOnce({ cloudPayments: { surchargePercent: 8 } } as never)
      .mockResolvedValueOnce({ cloudPayments: null } as never)
    expect(await loadPublicCloudPayments()).toEqual({ surchargePercent: 8 })
    expect(await reloadPublicCloudPayments()).toBeNull()
    expect(getPublicSettings).toHaveBeenNthCalledWith(2, { fresh: true })
    expect(await loadPublicCloudPayments()).toBeNull()
    expect(getPublicSettings).toHaveBeenCalledTimes(2)
  })

  it('нет поля или ошибка api — null', async () => {
    vi.mocked(getPublicSettings).mockResolvedValue({} as never)
    expect(await loadPublicCloudPayments()).toBeNull()
    resetPublicCloudPaymentsCacheForTests()
    vi.mocked(getPublicSettings).mockRejectedValue(new Error('down'))
    expect(await loadPublicCloudPayments()).toBeNull()
  })
})

describe('админ-превью CloudPayments (?cp_test=1)', () => {
  afterEach(() => {
    vi.mocked(getCloudPaymentsCheckoutPreview).mockReset()
  })

  it('спрашивается только при cp_test=1 в адресе', () => {
    expect(isCloudPaymentsPreviewRequested('?cp_test=1')).toBe(true)
    expect(isCloudPaymentsPreviewRequested('?utm_source=x&cp_test=1')).toBe(true)
    expect(isCloudPaymentsPreviewRequested('')).toBe(false)
    expect(isCloudPaymentsPreviewRequested('?cp_test=0')).toBe(false)
    expect(isCloudPaymentsPreviewRequested('?cp_test=true')).toBe(false)
  })

  it('процент из админ-эндпоинта; null — как есть', async () => {
    vi.mocked(getCloudPaymentsCheckoutPreview).mockResolvedValueOnce({ surchargePercent: 8 })
    expect(await loadCloudPaymentsAdminPreview()).toEqual({ surchargePercent: 8 })
    vi.mocked(getCloudPaymentsCheckoutPreview).mockResolvedValueOnce(null)
    expect(await loadCloudPaymentsAdminPreview()).toBeNull()
  })

  it('401 (не админ), сбой сети или мусор вместо процента — null', async () => {
    vi.mocked(getCloudPaymentsCheckoutPreview).mockRejectedValueOnce(new Error('401'))
    expect(await loadCloudPaymentsAdminPreview()).toBeNull()
    vi.mocked(getCloudPaymentsCheckoutPreview).mockResolvedValueOnce({
      surchargePercent: 'x',
    } as never)
    expect(await loadCloudPaymentsAdminPreview()).toBeNull()
  })
})
