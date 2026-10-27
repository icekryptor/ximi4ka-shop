import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({ getPublicSettings: vi.fn() }))
import { getPublicSettings } from '@/lib/api'
import { loadPublicCloudPayments, resetPublicCloudPaymentsCacheForTests } from './cloudPayments'

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

  it('нет поля или ошибка api — null', async () => {
    vi.mocked(getPublicSettings).mockResolvedValue({} as never)
    expect(await loadPublicCloudPayments()).toBeNull()
    resetPublicCloudPaymentsCacheForTests()
    vi.mocked(getPublicSettings).mockRejectedValue(new Error('down'))
    expect(await loadPublicCloudPayments()).toBeNull()
  })
})
