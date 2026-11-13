import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const getMeSession = vi.fn()
vi.mock('@/lib/accountApi', () => ({ getMeSession: () => getMeSession() }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ prefetch: vi.fn() }),
}))

import { Header } from './Header'

function setCookie(on: boolean) {
  document.cookie = `ximi4ka_customer_csrf=${on ? 'x' : ''}; path=/${on ? '' : '; expires=Thu, 01 Jan 1970 00:00:00 GMT'}`
}

beforeEach(() => {
  window.localStorage.clear()
  getMeSession.mockReset()
})
afterEach(() => {
  cleanup()
  setCookie(false)
  delete document.documentElement.dataset.signedIn
})

async function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }))
}

describe('Header: строка химикоинов в мобильном меню', () => {
  it('вошедший с балансом: строка есть', async () => {
    setCookie(true)
    getMeSession.mockResolvedValue({
      status: 'ok',
      me: { name: 'Р', email: null, coinBalance: 12345 },
    })
    render(<Header coinsEnabled />)
    await waitFor(() => expect(getMeSession).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('link', { name: /баланс 12 345/ })).toBeTruthy())
    await openMenu()
    expect(screen.getByText(/Химикоины: 12 345/)).toBeInTheDocument()
  })

  it('программа включена, баланс 0: строка есть (как чип)', async () => {
    setCookie(true)
    getMeSession.mockResolvedValue({ status: 'ok', me: { name: 'Р', email: null, coinBalance: 0 } })
    render(<Header coinsEnabled />)
    await waitFor(() => expect(getMeSession).toHaveBeenCalled())
    await openMenu()
    await waitFor(() => expect(screen.getByText(/Химикоины: 0/)).toBeInTheDocument())
  })

  it('гость: строки нет и запросов нет', async () => {
    setCookie(false)
    render(<Header coinsEnabled />)
    await openMenu()
    expect(getMeSession).not.toHaveBeenCalled()
    expect(screen.queryByText(/Химикоины/)).toBeNull()
  })

  it('программа выключена: строки нет, запросов нет, человечек остаётся — даже с cookie и балансом', async () => {
    setCookie(true)
    getMeSession.mockResolvedValue({
      status: 'ok',
      me: { name: 'Р', email: null, coinBalance: 50 },
    })
    render(<Header coinsEnabled={false} />)
    await openMenu()
    expect(getMeSession).not.toHaveBeenCalled()
    expect(screen.queryByText(/Химикоины/)).toBeNull()
    expect(document.querySelector('[data-account-user]')).toBeNull()
    expect(document.querySelector('[data-account-guest]')).not.toBeNull()
  })
})
