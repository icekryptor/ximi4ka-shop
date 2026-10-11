import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const fetchCurrentAdmin = vi.fn<() => Promise<{ id: string; email: string; role: string } | null>>()
vi.mock('@/lib/adminSession', () => ({ fetchCurrentAdmin: () => fetchCurrentAdmin() }))

import { AdminOnly } from './AdminOnly'

// Серверная защита раздела: API и так отдаст 403, но по прямой ссылке
// редактор должен увидеть понятное сообщение, а не ошибку страницы.
describe('<AdminOnly>', () => {
  beforeEach(() => {
    fetchCurrentAdmin.mockReset()
  })

  async function renderGuard() {
    render(await AdminOnly({ children: <p>секретный раздел</p> }))
  }

  it('admin видит раздел', async () => {
    fetchCurrentAdmin.mockResolvedValue({ id: '1', email: 'a@x.ru', role: 'admin' })

    await renderGuard()

    expect(screen.getByText('секретный раздел')).toBeInTheDocument()
  })

  it.each(['editor', 'superuser', 'Admin', ''])(
    'роль «%s»: раздела нет, есть сообщение и ссылка на главную',
    async (role) => {
      fetchCurrentAdmin.mockResolvedValue({ id: '1', email: 'e@x.ru', role })

      await renderGuard()

      expect(screen.queryByText('секретный раздел')).not.toBeInTheDocument()
      expect(screen.getByText(/недостаточно прав/i)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /на главную/i })).toHaveAttribute('href', '/admin')
    },
  )

  it('не удалось узнать пользователя: раздел закрыт', async () => {
    fetchCurrentAdmin.mockResolvedValue(null)

    await renderGuard()

    expect(screen.queryByText('секретный раздел')).not.toBeInTheDocument()
    expect(screen.getByText(/недостаточно прав/i)).toBeInTheDocument()
  })

  it('это асинхронный серверный компонент', () => {
    expect(AdminOnly.constructor.name).toBe('AsyncFunction')
  })
})
