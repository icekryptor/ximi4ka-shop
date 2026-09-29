import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { CustomerProfile } from '@ximi4ka-shop/shared'
import { ProfileCard } from './ProfileCard'

const api = vi.hoisted(() => ({
  getMe: vi.fn(),
  updateMe: vi.fn(),
  logout: vi.fn(),
  startLinkEmail: vi.fn(),
  verifyLinkEmail: vi.fn(),
  startLinkTelegram: vi.fn(),
  unlinkEmail: vi.fn(),
  unlinkTelegram: vi.fn(),
  pollTelegramLogin: vi.fn(),
  getAuthConfig: vi.fn(),
}))
vi.mock('@/lib/accountApi', () => api)
const redirect = vi.hoisted(() => vi.fn())
vi.mock('@/lib/checkout', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/checkout')>()),
  redirectTo: redirect,
}))

beforeEach(() => {
  // По умолчанию бот настроен — большинство тестов не про этот сценарий.
  api.getAuthConfig.mockResolvedValue({ email: true, telegram: true, telegramBot: 'bot' })
})

afterEach(() => {
  cleanup()
  Object.values(api).forEach((f) => f.mockReset())
})

const profile: CustomerProfile = {
  id: '1',
  email: 'ivan@example.com',
  telegramUsername: null,
  hasTelegram: false,
  name: 'Иван',
  phone: '+79001234567',
  lastDelivery: null,
}

async function openEdit() {
  fireEvent.click(await screen.findByRole('button', { name: 'Изменить' }))
}

describe('ProfileCard', () => {
  it('свёрнутая плашка показывает имя, телефон, email и Telegram', async () => {
    api.getMe.mockResolvedValue({ ...profile, hasTelegram: true, telegramUsername: 'ivan_tg' })
    render(<ProfileCard />)
    expect(await screen.findByText('Иван')).toBeInTheDocument()
    expect(screen.getByText('+7 (900) 123-45-67')).toBeInTheDocument()
    expect(screen.getByText('ivan@example.com')).toBeInTheDocument()
    expect(screen.getByText('@ivan_tg')).toBeInTheDocument()
    expect(screen.queryByLabelText('Имя')).toBeNull()
    expect(screen.getByRole('link', { name: /Написать в поддержку/ })).toHaveAttribute(
      'href',
      'https://t.me/ximi4ka_support',
    )
  })

  it('без Telegram и имени плашка пишет «не привязан» и «не указано»', async () => {
    api.getMe.mockResolvedValue({ ...profile, name: null, phone: null })
    render(<ProfileCard />)
    expect(await screen.findByText('не привязан')).toBeInTheDocument()
    expect(screen.getAllByText('не указано')).toHaveLength(2)
  })

  it('«Изменить» открывает форму, «Готово» сворачивает', async () => {
    api.getMe.mockResolvedValue(profile)
    render(<ProfileCard />)
    expect(screen.queryByLabelText('Имя')).toBeNull()
    await openEdit()
    expect(screen.getByLabelText('Имя')).toHaveValue('Иван')
    expect(screen.getByLabelText('Телефон')).toHaveValue('+7 (900) 123-45-67')
    const toggle = screen.getByRole('button', { name: 'Готово' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(screen.queryByLabelText('Имя')).toBeNull()
  })

  it('сохраняет имя и телефон', async () => {
    api.getMe.mockResolvedValue(profile)
    api.updateMe.mockResolvedValue({ ...profile, name: 'Пётр' })
    render(<ProfileCard />)
    await openEdit()
    const name = await screen.findByLabelText('Имя')
    fireEvent.change(name, { target: { value: 'Пётр' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await vi.waitFor(() =>
      expect(api.updateMe).toHaveBeenCalledWith({ name: 'Пётр', phone: '+79001234567' }),
    )
    expect(await screen.findByText('Сохранено')).toBeInTheDocument()
  })

  it('без Telegram — «Привязать Telegram»; отвязать единственный email нельзя', async () => {
    api.getMe.mockResolvedValue(profile)
    render(<ProfileCard />)
    await openEdit()
    expect(await screen.findByRole('button', { name: 'Привязать Telegram' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отвязать email' })).toBeNull()
  })

  it('бот не настроен — вместо «Привязать Telegram» сообщение о недоступности', async () => {
    api.getMe.mockResolvedValue(profile)
    api.getAuthConfig.mockResolvedValue({ email: true, telegram: false, telegramBot: null })
    render(<ProfileCard />)
    await openEdit()
    expect(await screen.findByText('Привязка Telegram пока недоступна')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Привязать Telegram' })).toBeNull()
  })

  it('конфиг входа не загрузился — Telegram считается недоступным', async () => {
    api.getMe.mockResolvedValue(profile)
    api.getAuthConfig.mockRejectedValue(new Error('network'))
    render(<ProfileCard />)
    await openEdit()
    expect(await screen.findByText('Привязка Telegram пока недоступна')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Привязать Telegram' })).toBeNull()
  })

  it('с Telegram и email — можно отвязать Telegram', async () => {
    api.getMe.mockResolvedValue({ ...profile, hasTelegram: true, telegramUsername: 'ivan_tg' })
    api.unlinkTelegram.mockResolvedValue(undefined)
    render(<ProfileCard />)
    await openEdit()
    fireEvent.click(screen.getByRole('button', { name: 'Отвязать Telegram' }))
    await vi.waitFor(() => expect(api.unlinkTelegram).toHaveBeenCalled())
  })

  it('выход ведёт на главную', async () => {
    api.getMe.mockResolvedValue(profile)
    api.logout.mockResolvedValue(undefined)
    render(<ProfileCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Выйти' }))
    await vi.waitFor(() => expect(redirect).toHaveBeenCalledWith('/'))
  })
})
