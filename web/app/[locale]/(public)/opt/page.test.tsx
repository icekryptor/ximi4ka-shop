import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/components/wholesale/WholesaleOrder', () => ({
  WholesaleOrder: () => <div data-testid="wholesale-order" />,
}))

import OptPage, { generateMetadata } from './page'

describe('OptPage', () => {
  it('is an async Server Component', () => {
    expect(OptPage.constructor.name).toBe('AsyncFunction')
  })

  it('отдаёт title с брендом и canonical на /opt', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'ru' }) })
    expect(meta.title).toBe('Оптовый заказ наборов, реактивов и оборудования — Химичка')
    expect(String(meta.alternates?.canonical)).toContain('/opt')
  })

  it('выводит h1, таблицу скидок и блок заказа', async () => {
    render(await OptPage({ params: Promise.resolve({ locale: 'ru' }) }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Оптом')
    expect(screen.getByRole('table', { name: 'Наборы' })).toBeInTheDocument()
    expect(screen.getByTestId('wholesale-order')).toBeInTheDocument()
  })
})
