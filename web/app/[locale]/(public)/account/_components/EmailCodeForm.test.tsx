import { afterEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ApiError } from '@/lib/api'
import { EmailCodeForm } from './EmailCodeForm'

afterEach(cleanup)

describe('EmailCodeForm', () => {
  it('email → код → onDone', async () => {
    const start = vi.fn(async () => {})
    const verify = vi.fn(async () => ({}))
    const onDone = vi.fn()
    render(<EmailCodeForm start={start} verify={verify} onDone={onDone} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ivan@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Получить код' }))
    const codeInput = await screen.findByLabelText('Код из письма')
    expect(start).toHaveBeenCalledWith('ivan@example.com')
    fireEvent.change(codeInput, { target: { value: '12 34 56' } })
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(verify).toHaveBeenCalledWith('ivan@example.com', '123456')
  })

  it('неверный код — показывает оставшиеся попытки', async () => {
    const verify = vi.fn(async () => {
      throw new ApiError(400, 'invalid_code', 'Неверный код', { attemptsLeft: 2 })
    })
    render(<EmailCodeForm start={async () => {}} verify={verify} onDone={() => {}} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.ru' } })
    fireEvent.click(screen.getByRole('button', { name: 'Получить код' }))
    fireEvent.change(await screen.findByLabelText('Код из письма'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Неверный код. Осталось попыток: 2')
  })

  it('повторная отправка доступна через 60 секунд, «Изменить email» возвращает к шагу 1', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      render(<EmailCodeForm start={async () => {}} verify={async () => ({})} onDone={() => {}} />)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.ru' } })
      fireEvent.click(screen.getByRole('button', { name: 'Получить код' }))
      const resend = await screen.findByRole('button', { name: /Отправить ещё раз/ })
      expect(resend).toBeDisabled()
      // Тикаем по секунде за раз: одним большим advanceTimersByTimeAsync
      // React под фейковыми таймерами не успевает перепланировать passive
      // effect между тиками (эффект «съедает» первый тик и застревает).
      for (let i = 0; i < 60; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000)
        })
      }
      expect(screen.getByRole('button', { name: 'Отправить ещё раз' })).toBeEnabled()
      fireEvent.click(screen.getByRole('button', { name: 'Изменить email' }))
      expect(screen.getByLabelText('Email')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
