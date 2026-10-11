import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminOnly } from '@/components/admin/AdminOnly'
import AdminOrdersPage from './orders/page'
import AdminOrderDetailPage from './orders/[id]/page'
import AdminSettingsPage from './settings/page'

// Заказы и настройки закрыты для редактора проверкой внутри самой страницы:
// layout и page рендерятся параллельно, поэтому защита в layout страницу не
// останавливает. Тест не даёт убрать обёртку при рефакторинге.
describe('страницы только для admin', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  it('список заказов обёрнут в AdminOnly и сам ничего не запрашивает', async () => {
    const tree = await AdminOrdersPage({ searchParams: Promise.resolve({}) })

    expect(tree.type).toBe(AdminOnly)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('карточка заказа обёрнута в AdminOnly и сама ничего не запрашивает', async () => {
    const tree = await AdminOrderDetailPage({ params: Promise.resolve({ id: 'x' }) })

    expect(tree.type).toBe(AdminOnly)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('настройки обёрнуты в AdminOnly и сами ничего не запрашивают', async () => {
    const tree = await AdminSettingsPage()

    expect(tree.type).toBe(AdminOnly)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
