import { describe, it, expect } from 'vitest'
import { deliveryProblemLabel, orderCoinsState, type OrderCoinsInput } from './orderCoins'

const base: OrderCoinsInput = {
  status: 'paid',
  customerId: 'c1',
  cashbackPromisedCoins: 190,
  cashbackAccruedCoins: 0,
  cashbackShortfallCoins: 0,
  deliveryProblem: null,
}

describe('orderCoinsState', () => {
  it('обещано 0 — кэшбек не обещан', () => {
    const s = orderCoinsState({ ...base, cashbackPromisedCoins: 0 })
    expect(s.headline).toBe(
      'Кэшбек не обещан (заказ создан до запуска программы или программа была выключена)',
    )
    expect(s.shortfallWarning).toBeNull()
    expect(s.guestNote).toBeNull()
  })

  it.each(['paid', 'shipped'] as const)(
    'оплачен/отправлен, не начислено — ожидает (%s)',
    (status) => {
      const s = orderCoinsState({ ...base, status })
      expect(s.headline).toBe('Ожидает получения: 190')
    },
  )

  it('начислено и заказ получен', () => {
    const s = orderCoinsState({ ...base, status: 'delivered', cashbackAccruedCoins: 190 })
    expect(s.headline).toBe('Начислено: 190')
    expect(s.shortfallWarning).toBeNull()
  })

  it('отменён после начисления, всё отозвано', () => {
    const s = orderCoinsState({ ...base, status: 'cancelled', cashbackAccruedCoins: 190 })
    expect(s.headline).toBe('Начисление отозвано: 190 из 190')
    expect(s.shortfallWarning).toBeNull()
  })

  it('отменён после начисления, есть недостача', () => {
    const s = orderCoinsState({
      ...base,
      status: 'cancelled',
      cashbackAccruedCoins: 190,
      cashbackShortfallCoins: 90,
    })
    expect(s.headline).toBe('Начисление отозвано: 100 из 190')
    expect(s.shortfallWarning).toBe('Недостача: 90 — химикоины уже были потрачены')
  })

  it('гостевой заказ с обещанием — пометка', () => {
    const s = orderCoinsState({ ...base, customerId: null })
    expect(s.guestNote).toBe('Заказ гостевой: начислится, когда покупатель войдёт с этой почтой')
  })

  it('гостевой заказ без обещания — без пометки', () => {
    const s = orderCoinsState({ ...base, customerId: null, cashbackPromisedCoins: 0 })
    expect(s.guestNote).toBeNull()
  })

  it('неоплаченный заказ — обещано, но не ожидает получения', () => {
    const s = orderCoinsState({ ...base, status: 'pending' })
    expect(s.headline).toBe('Обещано: 190 (начислится после получения заказа)')
  })

  it('отменён без начисления', () => {
    const s = orderCoinsState({ ...base, status: 'cancelled' })
    expect(s.headline).toBe('Кэшбек не начислялся (заказ отменён)')
  })

  it('получен, но не начислен (гость)', () => {
    const s = orderCoinsState({ ...base, status: 'delivered', customerId: null })
    expect(s.headline).toBe('Не начислено: 190')
  })

  it('пометки проблем доставки', () => {
    expect(deliveryProblemLabel('cdek_not_delivered')).toBe('СДЭК: посылка не вручена')
    expect(deliveryProblemLabel('cdek_tracking_timeout')).toBe('СДЭК: 60 дней без вручения')
    expect(deliveryProblemLabel('cdek_partial_delivery')).toBe(
      'СДЭК: частичное вручение — решите вручную',
    )
    expect(deliveryProblemLabel(null)).toBeNull()
    expect(orderCoinsState({ ...base, deliveryProblem: 'cdek_not_delivered' }).problem).toBe(
      'СДЭК: посылка не вручена',
    )
  })
})
