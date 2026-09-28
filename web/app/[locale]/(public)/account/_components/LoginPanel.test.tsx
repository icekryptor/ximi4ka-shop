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

  it('бот выключен, почта включена — кнопки Telegram нет, форма почты есть', () => {
    render(
      <LoginPanel next="/account" config={{ email: true, telegram: false, telegramBot: null }} />,
    )
    expect(screen.queryByRole('button', { name: 'Войти через Telegram' })).toBeNull()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('оба способа выключены — сообщение о недоступности и кнопка поддержки, форм нет', () => {
    render(
      <LoginPanel next="/account" config={{ email: false, telegram: false, telegramBot: null }} />,
    )
    expect(screen.getByText(/Вход в личный кабинет временно недоступен/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /поддержку/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Войти через Telegram' })).toBeNull()
  })
})
