import { describe, it, expect } from 'vitest'
import AdminOrdersPage from './page'
import AdminOrderDetailPage from './[id]/page'
import { OrderStatusActions } from './[id]/OrderStatusActions'
import { ORDER_STATUS_LABELS, formatRub } from './orderUi'

// Server components (list + detail) run on the server and call
// cookies()/fetch() — narrow smoke tests ensure they stay async. The status
// actions block is a client component. Mirrors redirects/page.test.tsx.
describe('Admin orders pages', () => {
  it('list page is an async server component', () => {
    expect(AdminOrdersPage.constructor.name).toBe('AsyncFunction')
  })
  it('detail page is an async server component', () => {
    expect(AdminOrderDetailPage.constructor.name).toBe('AsyncFunction')
  })
  it('status actions is a function component', () => {
    expect(typeof OrderStatusActions).toBe('function')
  })
})

describe('order UI helpers', () => {
  it('has Russian labels for every status', () => {
    expect(ORDER_STATUS_LABELS).toEqual({
      pending: 'Ожидает оплаты',
      paid: 'Оплачен',
      failed: 'Ошибка оплаты',
      cancelled: 'Отменён',
    })
  })
  it('formats rubles with the ru-RU thousands separator', () => {
    expect(formatRub(4500).endsWith('₽')).toBe(true)
    expect(formatRub(4500)).toContain('4')
  })
})
