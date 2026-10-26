import { afterEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/lib/api'
import { fetchSplitAvailable, splitPaymentRub } from './splitInstallments'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('splitPaymentRub', () => {
  it('цена на 4 платежа, с округлением вверх до рубля', () => {
    expect(splitPaymentRub(3099)).toBe(775)
    expect(splitPaymentRub(1700)).toBe(425)
  })

  it('ноль, минус и не-число — строки нет', () => {
    expect(splitPaymentRub(0)).toBeNull()
    expect(splitPaymentRub(-5)).toBeNull()
    expect(splitPaymentRub(Number.NaN)).toBeNull()
  })
})

describe('fetchSplitAvailable', () => {
  type Settings = Awaited<ReturnType<typeof api.getPublicSettings>>

  it('Сплит включён в публичных настройках — true', async () => {
    vi.spyOn(api, 'getPublicSettings').mockResolvedValue({
      yandexPay: { split: true },
    } as Settings)
    expect(await fetchSplitAvailable()).toBe(true)
  })

  it('Яндекс выключен или api лежит — false', async () => {
    vi.spyOn(api, 'getPublicSettings').mockResolvedValue({ yandexPay: null } as Settings)
    expect(await fetchSplitAvailable()).toBe(false)
    vi.spyOn(api, 'getPublicSettings').mockRejectedValue(new Error('down'))
    expect(await fetchSplitAvailable()).toBe(false)
  })
})
