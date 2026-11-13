import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CashbackRow } from './CashbackRow'

describe('CashbackRow', () => {
  it('tells a signed-in customer what comes back', () => {
    render(<CashbackRow coins={190} signedIn />)
    expect(screen.getByText('Вернём 190 химикоинов')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Войдите' })).toBeNull()
  })

  it.each([
    [1, '1 химикоин'],
    [3, '3 химикоина'],
    [11, '11 химикоинов'],
    [1900, '1 900 химикоинов'],
  ])('declines the word for %i', (n, text) => {
    render(<CashbackRow coins={n} signedIn />)
    expect(screen.getByText(`Вернём ${text}`)).toBeInTheDocument()
  })

  it('renders nothing when there are no coins', () => {
    const { container } = render(<CashbackRow coins={0} signedIn />)
    expect(container).toBeEmptyDOMElement()
  })

  it('invites a guest to sign in via a link to the account login', () => {
    render(<CashbackRow coins={190} signedIn={false} />)
    const link = screen.getByRole('link', { name: 'Войдите' })
    expect(link.getAttribute('href')).toMatch(/^\/account/)
    expect(screen.getByTestId('summary-cashback')).toHaveTextContent(
      'Войдите, чтобы получить 190 химикоинов',
    )
  })

  it('links to the rules page', () => {
    render(<CashbackRow coins={190} signedIn />)
    expect(screen.getByRole('link', { name: 'Правила программы' })).toHaveAttribute(
      'href',
      '/himikoiny',
    )
  })
})
