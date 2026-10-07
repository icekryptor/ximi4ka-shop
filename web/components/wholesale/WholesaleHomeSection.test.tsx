import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./WholesaleOrder', () => ({ WholesaleOrder: () => <div data-testid="wholesale-order" /> }))

import { WholesaleHomeSection } from './WholesaleHomeSection'

describe('WholesaleHomeSection', () => {
  it('содержит сводку скидок, блок заказа и ссылку на /opt', () => {
    render(<WholesaleHomeSection href="/opt" />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Оптом')
    expect(screen.getByText(/до −30%/)).toBeInTheDocument()
    expect(screen.getByTestId('wholesale-order')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Все условия опта' })).toHaveAttribute('href', '/opt')
  })
})
