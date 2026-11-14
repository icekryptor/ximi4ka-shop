import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const getMeSession = vi.fn()
vi.mock('@/lib/accountApi', () => ({ getMeSession: () => getMeSession() }))
let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

import { AccountLink } from './AccountLink'
import { hasSignedInCookie } from '@/lib/signedInHint'

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
const ok = (over: object = {}) => ({ status: 'ok', me: profile(over) })

describe('<AccountLink>', () => {
  beforeEach(() => {
    getMeSession.mockReset()
    pathname = '/'
  })

  it('гость: человечек, запросов нет', () => {
    reset(false)
    render(<AccountLink coinsEnabled />)
    expect(getMeSession).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Личный кабинет' })).toHaveAttribute('href', '/account')
    expect(document.querySelector('[data-account-guest]')).not.toBeNull()
    expect(document.documentElement.dataset.signedIn).toBeUndefined()
  })

  it('есть cookie: плейсхолдер чипа сразу в разметке, затем буква и баланс', async () => {
    reset(true)
    getMeSession.mockResolvedValue(ok({ coinBalance: 12345 }))
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
    getMeSession.mockResolvedValue(ok({ coinBalance: 21 }))
    render(<AccountLink coinsEnabled />)
    await waitFor(() =>
      expect(screen.getByRole('link')).toHaveAttribute(
        'aria-label',
        'Личный кабинет, баланс 21 химикоин',
      ),
    )
  })

  it('401: cookie снимается, атрибут снимается, на следующем маршруте запроса нет', async () => {
    reset(true)
    getMeSession.mockResolvedValue({ status: 'unauthorized' })
    const { rerender } = render(<AccountLink coinsEnabled />)
    await waitFor(() => expect(document.documentElement.dataset.signedIn).toBeUndefined())
    expect(hasSignedInCookie()).toBe(false)
    expect(screen.getByRole('link', { name: 'Личный кабинет' })).toBeInTheDocument()
    pathname = '/catalog'
    rerender(<AccountLink coinsEnabled />)
    expect(getMeSession).toHaveBeenCalledTimes(1)
  })

  it('500: cookie остаётся, запрос один, на следующем маршруте не повторяется', async () => {
    reset(true)
    getMeSession.mockResolvedValue({ status: 'error' })
    const { rerender } = render(<AccountLink coinsEnabled />)
    await waitFor(() => expect(getMeSession).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    expect(hasSignedInCookie()).toBe(true)
    pathname = '/catalog'
    rerender(<AccountLink coinsEnabled />)
    pathname = '/about'
    rerender(<AccountLink coinsEnabled />)
    expect(getMeSession).toHaveBeenCalledTimes(1)
  })

  it('после ошибки новая cookie (повторный вход) снова проверяется', async () => {
    reset(true)
    getMeSession.mockResolvedValue({ status: 'error' })
    const { rerender } = render(<AccountLink coinsEnabled />)
    await waitFor(() => expect(getMeSession).toHaveBeenCalledTimes(1))
    document.cookie = 'ximi4ka_customer_csrf=new; path=/'
    getMeSession.mockResolvedValue(ok())
    pathname = '/catalog'
    rerender(<AccountLink coinsEnabled />)
    await waitFor(() => expect(getMeSession).toHaveBeenCalledTimes(2))
  })

  it('программа включена, баланс 0: чип есть', async () => {
    reset(true)
    getMeSession.mockResolvedValue(ok({ coinBalance: 0 }))
    render(<AccountLink coinsEnabled />)
    await waitFor(() => expect(screen.getByText('Р')).toBeInTheDocument())
    expect(document.querySelector('[data-account-chip]')).not.toBeNull()
  })

  it('программа выключена: человечек, без аватара и чипа, /me не запрашивается, даже с cookie', async () => {
    reset(true)
    getMeSession.mockResolvedValue(ok({ coinBalance: 50 }))
    const cb = vi.fn()
    render(<AccountLink coinsEnabled={false} onBalanceChange={cb} />)
    await Promise.resolve()
    expect(getMeSession).not.toHaveBeenCalled()
    expect(document.querySelector('[data-account-guest]')).not.toBeNull()
    expect(document.querySelector('[data-account-user]')).toBeNull()
    expect(document.querySelector('[data-account-chip]')).toBeNull()
    expect(screen.getByRole('link')).toHaveAttribute('aria-label', 'Личный кабинет')
    expect(hasSignedInCookie()).toBe(true) // чужую cookie не трогаем
  })

  it('профиль без имени берёт букву почты', async () => {
    reset(true)
    getMeSession.mockResolvedValue(ok({ name: null, email: 'buyer@test.local' }))
    render(<AccountLink coinsEnabled />)
    await waitFor(() => expect(screen.getByText('B')).toBeInTheDocument())
  })

  it('узкий экран: в слоте только кружок 20px, чип скрыт до xl, слот не сжимается', async () => {
    reset(true)
    getMeSession.mockResolvedValue(ok())
    render(<AccountLink coinsEnabled />)
    const link = screen.getByRole('link')
    await waitFor(() =>
      expect(link).toHaveAttribute('title', 'Личный кабинет, баланс 190 химикоинов'),
    )
    expect(link.className).toMatch(/(^|\s)shrink-0(\s|$)/)
    const avatar = document.querySelector('[data-account-user] > span') as HTMLElement
    expect(avatar.className).toMatch(/(^|\s)h-5(\s|$)/)
    expect(avatar.className).toMatch(/(^|\s)w-5(\s|$)/)
    const chip = document.querySelector('[data-account-chip]') as HTMLElement
    expect(chip.className).toMatch(/(^|\s)hidden(\s|$)/)
    expect(chip.className).toMatch(/(^|\s)xl:inline-flex(\s|$)/)
    // ширина резервируется по содержимому: 7 знаков «123 456» + обвязка
    expect(chip.className).toContain('min-w-[calc(7ch+2.25rem)]')
    expect(chip.className).toContain('tabular-nums')
  })

  it('сообщает баланс наверх: число для вошедшего, null для протухшей сессии', async () => {
    reset(true)
    const cb = vi.fn()
    getMeSession.mockResolvedValue(ok({ coinBalance: 190 }))
    const { unmount } = render(<AccountLink coinsEnabled onBalanceChange={cb} />)
    await waitFor(() => expect(cb).toHaveBeenCalledWith(190))
    unmount()
    reset(true)
    getMeSession.mockResolvedValue({ status: 'unauthorized' })
    const cb2 = vi.fn()
    render(<AccountLink coinsEnabled onBalanceChange={cb2} />)
    await waitFor(() => expect(cb2).toHaveBeenCalledWith(null))
  })
})
