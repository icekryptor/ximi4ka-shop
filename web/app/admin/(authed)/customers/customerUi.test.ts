import { describe, it, expect } from 'vitest'
import { customerOrderCashback, customersHref } from './customerUi'

describe('customerOrderCashback', () => {
  it('по статусам', () => {
    expect(customerOrderCashback({ status: 'paid', cashbackPromisedCoins: 0 })).toBe('—')
    expect(customerOrderCashback({ status: 'paid', cashbackPromisedCoins: 190 })).toBe(
      'Ожидает получения: 190',
    )
    expect(customerOrderCashback({ status: 'delivered', cashbackPromisedCoins: 1900 })).toBe(
      'Начислено: 1 900',
    )
    expect(customerOrderCashback({ status: 'cancelled', cashbackPromisedCoins: 190 })).toBe(
      'Отменён',
    )
    expect(customerOrderCashback({ status: 'pending', cashbackPromisedCoins: 190 })).toBe(
      'Обещано: 190',
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
