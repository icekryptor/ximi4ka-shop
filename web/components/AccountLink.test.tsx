import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const getMeOrNull = vi.fn()
vi.mock('@/lib/accountApi', () => ({ getMeOrNull: () => getMeOrNull() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

import { AccountLink } from './AccountLink'

function reset(signedIn: boolean) {
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
  delete document.documentElement.dataset.signedIn
  if (signedIn) {
    document.cookie = 'ximi4ka_customer_csrf=abc; path=/'
    document.documentElement.dataset.signedIn = '1' // как после инлайн-скрипта
  }
}

const profile = (over: object = {}) => ({ name: 'рената', email: null, coinBalance: 190, ...over })

describe('<AccountLink>', () => {
  beforeEach(() => getMeOrNull.mockReset())

  it('гость: человечек, запросов нет', () => {
    reset(false)
    render(<AccountLink coinsEnabled />)
    expect(getMeOrNull).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Личный кабинет' })).toHaveAttribute('href', '/account')
    expect(document.querySelector('[data-account-guest]')).not.toBeNull()
    expect(document.documentElement.dataset.signedIn).toBeUndefined()
  })

  it('есть cookie: плейсхолдер чипа сразу в разметке, затем буква и баланс', async () => {
    reset(true)
    getMeOrNull.mockResolvedValue(profile({ coinBalance: 12345 }))
    render(<AccountLink coinsEnabled />)
    expect(document.querySelector('[data-account-chip]')).not.toBeNull()
    await waitFor(() => expect(screen.getByText('12 345')).toBeInTheDocument())
    expect(screen.getByText('Р')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute(
      'aria-label',
      'Личный кабинет, баланс 12 345 химикоинов',
    )
  })

  it('форма слова в aria-label', async () => {
    reset(true)
    getMeOrNull.mockResolvedValue(profile({ coinBalance: 21 }))
    render(<AccountLink coinsEnabled />)
    await waitFor(() =>
      expect(screen.getByRole('link')).toHaveAttribute(
        'aria-label',
        'Личный кабинет, баланс 21 химикоин',
      ),
    )
  })

  it('протухшая сессия: атрибут снимается, остаётся человечек', async () => {
    reset(true)
    getMeOrNull.mockResolvedValue(null)
    render(<AccountLink coinsEnabled />)
    await waitFor(() => expect(document.documentElement.dataset.signedIn).toBeUndefined())
    expect(screen.getByRole('link', { name: 'Личный кабинет' })).toBeInTheDocument()
  })

  it('программа выключена и баланс 0: чипа нет', async () => {
    reset(true)
    getMeOrNull.mockResolvedValue(profile({ coinBalance: 0 }))
    render(<AccountLink coinsEnabled={false} />)
    expect(document.querySelector('[data-account-chip]')).toBeNull()
    await waitFor(() => expect(screen.getByText('Р')).toBeInTheDocument())
    expect(document.querySelector('[data-account-chip]')).toBeNull()
    expect(screen.getByRole('link')).toHaveAttribute('aria-label', 'Личный кабинет')
  })

  it('программа выключена, но баланс есть: чип появляется', async () => {
    reset(true)
    getMeOrNull.mockResolvedValue(profile({ coinBalance: 50 }))
    render(<AccountLink coinsEnabled={false} />)
    await waitFor(() => expect(screen.getByText('50')).toBeInTheDocument())
    expect(document.querySelector('[data-account-chip]')).not.toBeNull()
  })

  it('ошибка сети (null) без cookie не вызывается; с cookie профиль без имени берёт почту', async () => {
    reset(true)
    getMeOrNull.mockResolvedValue(profile({ name: null, email: 'buyer@test.local' }))
    render(<AccountLink coinsEnabled />)
    await waitFor(() => expect(screen.getByText('B')).toBeInTheDocument())
  })
})
