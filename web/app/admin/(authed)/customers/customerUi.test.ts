import { describe, it, expect } from 'vitest'
import type { OrderStatus } from '@ximi4ka-shop/shared'
import { customerOrderCashback, customersHref, firstParam } from './customerUi'

describe('customerOrderCashback', () => {
  const order = (status: OrderStatus, promised = 190) => ({
    id: 'o1',
    status,
    cashbackPromisedCoins: promised,
  })
  const accrual = { orderId: 'o1', kind: 'order_cashback' as const, amount: 190 }
  const revoke = (amount: number) => ({
    orderId: 'o1',
    kind: 'order_cashback_revoke' as const,
    amount,
  })
  const filler = (n: number) =>
    Array.from({ length: n }, () => ({
      orderId: 'other',
      kind: 'admin_adjust' as const,
      amount: 1,
    }))

  it('обещано 0 — прочерк', () => {
    expect(customerOrderCashback(order('delivered', 0), [])).toBe('—')
  })
  it('получен и есть начисление', () => {
    expect(customerOrderCashback(order('delivered'), [accrual])).toBe('Начислено: 190')
  })
  it('получен без строки начисления', () => {
    expect(customerOrderCashback(order('delivered'), [])).toBe('Получен, не начислено')
  })
  it('чужие строки не считаются', () => {
    expect(customerOrderCashback(order('delivered'), [{ ...accrual, orderId: 'o2' }])).toBe(
      'Получен, не начислено',
    )
  })
  it('отменён: начисление и частичный отзыв', () => {
    expect(customerOrderCashback(order('cancelled'), [accrual, revoke(-100)])).toBe(
      'Отозвано: 100 из 190',
    )
  })
  it('отменён: начисление и полный отзыв', () => {
    expect(customerOrderCashback(order('cancelled'), [accrual, revoke(-190)])).toBe(
      'Отозвано: 190 из 190',
    )
  })
  it('отменён: начисление без отзыва', () => {
    expect(customerOrderCashback(order('cancelled'), [accrual])).toBe('Отозвано: 0 из 190')
  })
  it('отменён без начисления', () => {
    expect(customerOrderCashback(order('cancelled'), [])).toBe('Отменён')
  })
  it('оплачен/отправлен — ожидает получения', () => {
    expect(customerOrderCashback(order('paid'), [])).toBe('Ожидает получения: 190')
    expect(customerOrderCashback(order('shipped'), [])).toBe('Ожидает получения: 190')
  })
  it('не оплачен — обещано', () => {
    expect(customerOrderCashback(order('pending'), [])).toBe('Обещано: 190')
  })
  it('ровно 100 операций и строки заказа нет — об отсутствии не заявляем', () => {
    expect(customerOrderCashback(order('delivered'), filler(100))).toBe(
      'Обещано: 190 (см. историю)',
    )
    expect(customerOrderCashback(order('cancelled'), filler(100))).toBe(
      'Обещано: 190 (см. историю)',
    )
  })
  it('ровно 100 операций, но строка заказа есть — по ней', () => {
    expect(customerOrderCashback(order('delivered'), [accrual, ...filler(99)])).toBe(
      'Начислено: 190',
    )
  })
})

describe('customersHref', () => {
  it('собирает адрес без лишнего', () => {
    expect(customersHref('', 1)).toBe('/admin/customers')
    expect(customersHref('ivan@x.ru', 2)).toBe('/admin/customers?q=ivan%40x.ru&page=2')
    expect(customersHref('', 3)).toBe('/admin/customers?page=3')
  })
})

describe('firstParam', () => {
  it('строка, массив и пусто', () => {
    expect(firstParam('a')).toBe('a')
    expect(firstParam(['a', 'b'])).toBe('a')
    expect(firstParam([])).toBeUndefined()
    expect(firstParam(undefined)).toBeUndefined()
  })
})
