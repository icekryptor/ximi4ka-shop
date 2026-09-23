import { describe, it, expect, vi } from 'vitest'
import { CdekError } from '../cdek/client.js'
import { quoteDelivery, deliveryConfigFromEnv } from './quote.js'
import type { ShippingPackage } from '@ximi4ka-shop/shared'

const packages: ShippingPackage[] = [
  {
    box: 'large',
    weightG: 1300,
    lengthCm: 40,
    widthCm: 32,
    heightCm: 8,
    estimated: false,
    items: [],
  },
]
const config = deliveryConfigFromEnv({})
const pvz = {
  method: 'cdek_pvz' as const,
  cityCode: 270,
  deliveryPointCode: 'NSK1',
  address: 'ул. Кривощековская, 15',
}
const courier = {
  method: 'cdek_courier' as const,
  cityCode: 270,
  address: 'Новосибирск, ул. Большевистская, 101',
}

function cdekReturning(result: unknown) {
  return { post: vi.fn().mockResolvedValue(result) }
}

describe('quoteDelivery', () => {
  it('ниже порога — покупатель платит цену СДЭК, округлённую вверх до рубля', async () => {
    const cdek = cdekReturning({ total_sum: 412.3, period_min: 3, period_max: 5 })
    const quote = await quoteDelivery(
      { destination: pvz, subtotalRub: 1500, packages },
      { cdek, config },
    )
    expect(quote).toEqual({
      method: 'cdek_pvz',
      tariffCode: 136,
      customerPriceRub: 413,
      cdekPriceRub: 413,
      periodMin: 3,
      periodMax: 5,
      free: false,
      source: 'cdek',
    })
  })

  it('ПВЗ от 3000 ₽ — бесплатно для покупателя, стоимость СДЭК всё равно известна', async () => {
    const cdek = cdekReturning({ total_sum: 412, period_min: 3, period_max: 5 })
    const quote = await quoteDelivery(
      { destination: pvz, subtotalRub: 3000, packages },
      { cdek, config },
    )
    expect(quote).toMatchObject({ customerPriceRub: 0, cdekPriceRub: 412, free: true })
  })

  it('курьер бесплатен только от 5000 ₽', async () => {
    const cdek = cdekReturning({ total_sum: 600, period_min: 2, period_max: 4 })
    const at4000 = await quoteDelivery(
      { destination: courier, subtotalRub: 4000, packages },
      { cdek, config },
    )
    const at5000 = await quoteDelivery(
      { destination: courier, subtotalRub: 5000, packages },
      { cdek, config },
    )
    expect(at4000).toMatchObject({ tariffCode: 137, customerPriceRub: 600, free: false })
    expect(at5000).toMatchObject({ customerPriceRub: 0, free: true })
  })

  it('отправляет в калькулятор места с весом в граммах и габаритами в см', async () => {
    const cdek = cdekReturning({ total_sum: 400 })
    await quoteDelivery({ destination: pvz, subtotalRub: 100, packages }, { cdek, config })
    expect(cdek.post).toHaveBeenCalledWith('/calculator/tariff', {
      tariff_code: 136,
      from_location: { code: 44 },
      to_location: { code: 270 },
      packages: [{ weight: 1300, length: 40, width: 32, height: 8 }],
    })
  })

  it('курьеру передаёт адрес получателя', async () => {
    const cdek = cdekReturning({ total_sum: 400 })
    await quoteDelivery({ destination: courier, subtotalRub: 100, packages }, { cdek, config })
    expect(cdek.post.mock.calls[0][1].to_location).toEqual({
      code: 270,
      address: 'Новосибирск, ул. Большевистская, 101',
    })
  })

  it('СДЭК не ответил — фиксированная ставка, чекаут не падает', async () => {
    const cdek = { post: vi.fn().mockRejectedValue(new CdekError(0, 'network_error', 'timeout')) }
    const quote = await quoteDelivery(
      { destination: pvz, subtotalRub: 1000, packages },
      { cdek, config },
    )
    expect(quote).toMatchObject({ customerPriceRub: 350, cdekPriceRub: null, source: 'fallback' })
  })

  it('СДЭК не ответил, но заказ от порога — всё равно бесплатно', async () => {
    const cdek = { post: vi.fn().mockRejectedValue(new Error('boom')) }
    const quote = await quoteDelivery(
      { destination: pvz, subtotalRub: 3500, packages },
      { cdek, config },
    )
    expect(quote).toMatchObject({ customerPriceRub: 0, free: true, source: 'fallback' })
  })
})

describe('deliveryConfigFromEnv', () => {
  it('по умолчанию — отправка из Москвы, тарифы 136 (ПВЗ) и 137 (курьер)', () => {
    expect(deliveryConfigFromEnv({})).toEqual({
      fromCityCode: 44,
      tariffPvz: 136,
      tariffCourier: 137,
    })
  })

  it('читает переопределения из окружения', () => {
    expect(
      deliveryConfigFromEnv({
        CDEK_FROM_CITY_CODE: '270',
        CDEK_TARIFF_PVZ: '234',
        CDEK_TARIFF_COURIER: '233',
      }),
    ).toEqual({ fromCityCode: 270, tariffPvz: 234, tariffCourier: 233 })
  })
})
