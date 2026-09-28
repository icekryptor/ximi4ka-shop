import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LoginPanel } from './LoginPanel'

vi.mock('@/lib/accountApi', () => ({
  startEmailLogin: vi.fn(),
  verifyEmailLogin: vi.fn(),
  startTelegramLogin: vi.fn(),
  pollTelegramLogin: vi.fn(),
}))

afterEach(cleanup)

describe('LoginPanel', () => {
  it('оба способа и текст согласия на обработку данных', () => {
    render(
      <LoginPanel
        next="/account"
        config={{ email: true, telegram: true, telegramBot: 'ximi4ka_bot' }}
      />,
    )
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Войти через Telegram' })).toBeInTheDocument()
    expect(screen.getByText(/условиями обработки персональных данных/)).toBeInTheDocument()
  })

  it('бот выключен — кнопки Telegram нет; почта выключена — пояснение', () => {
    render(
      <LoginPanel next="/account" config={{ email: false, telegram: false, telegramBot: null }} />,
    )
    expect(screen.queryByRole('button', { name: 'Войти через Telegram' })).toBeNull()
    expect(screen.getByText('Вход по почте временно недоступен')).toBeInTheDocument()
  })
})
