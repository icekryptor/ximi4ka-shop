import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const getMeOrNull = vi.fn()
vi.mock('@/lib/accountApi', () => ({ getMeOrNull: () => getMeOrNull() }))
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
  getMeOrNull.mockReset()
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
    getMeOrNull.mockResolvedValue({ name: 'Р', email: null, coinBalance: 12345 })
    render(<Header coinsEnabled />)
    await waitFor(() => expect(getMeOrNull).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('link', { name: /баланс 12 345/ })).toBeTruthy())
    await openMenu()
    expect(screen.getByText(/Химикоины: 12 345/)).toBeInTheDocument()
  })

  it('программа включена, баланс 0: строка есть (как чип)', async () => {
    setCookie(true)
    getMeOrNull.mockResolvedValue({ name: 'Р', email: null, coinBalance: 0 })
    render(<Header coinsEnabled />)
    await waitFor(() => expect(getMeOrNull).toHaveBeenCalled())
    await openMenu()
    await waitFor(() => expect(screen.getByText(/Химикоины: 0/)).toBeInTheDocument())
  })

  it('гость: строки нет и запросов нет', async () => {
    setCookie(false)
    render(<Header coinsEnabled />)
    await openMenu()
    expect(getMeOrNull).not.toHaveBeenCalled()
    expect(screen.queryByText(/Химикоины/)).toBeNull()
  })

  it('программа выключена и баланс 0: строки нет', async () => {
    setCookie(true)
    getMeOrNull.mockResolvedValue({ name: 'Р', email: null, coinBalance: 0 })
    render(<Header coinsEnabled={false} />)
    await waitFor(() => expect(getMeOrNull).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('Р')).toBeInTheDocument())
    await openMenu()
    expect(screen.queryByText(/Химикоины/)).toBeNull()
  })

  it('программа выключена, баланс 50: строка есть', async () => {
    setCookie(true)
    getMeOrNull.mockResolvedValue({ name: 'Р', email: null, coinBalance: 50 })
    render(<Header coinsEnabled={false} />)
    await waitFor(() => expect(screen.getByText('50')).toBeInTheDocument())
    await openMenu()
    expect(screen.getByText(/Химикоины: 50/)).toBeInTheDocument()
  })
})
