import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { AccountMaterial } from '@ximi4ka-shop/shared'
import { MaterialsList } from './MaterialsList'

const getMaterials = vi.hoisted(() => vi.fn())
vi.mock('@/lib/accountApi', () => ({ getMaterials }))

afterEach(() => {
  cleanup()
  getMaterials.mockReset()
})

const material = (extra: Partial<AccountMaterial> = {}): AccountMaterial => ({
  id: 'm1',
  title: 'Методичка «Химичка»',
  kind: 'file',
  fileName: 'himichka.pdf',
  sizeBytes: 1000,
  grantedAt: '2026-10-12T10:00:00.000Z',
  ...extra,
})

describe('MaterialsList', () => {
  it('пока грузится — показывает «Загружаем…»', () => {
    getMaterials.mockReturnValue(new Promise(() => {}))
    render(<MaterialsList />)
    expect(screen.getByText('Загружаем…')).toBeInTheDocument()
  })

  it('нет материалов — подсказка', async () => {
    getMaterials.mockResolvedValue([])
    render(<MaterialsList />)
    expect(await screen.findByTestId('materials-empty')).toHaveTextContent('после покупки набора')
  })

  it('список материалов — ссылки на скачивание через API кабинета', async () => {
    getMaterials.mockResolvedValue([material()])
    render(<MaterialsList />)
    const link = await screen.findByRole('link', { name: /Методичка «Химичка»/ })
    expect(link.getAttribute('href')).toMatch(/\/api\/account\/materials\/m1\/download$/)
  })

  it('ошибка загрузки — сообщение', async () => {
    getMaterials.mockRejectedValue(new Error('boom'))
    render(<MaterialsList />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить материалы')
  })
})
