import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ApiError } from '@/lib/api'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const adjust = vi.fn<(...args: unknown[]) => Promise<{ balance: number }>>()
vi.mock('@/lib/adminApi', async () => {
  const api = await import('@/lib/api')
  return { adminAdjustCoins: (...args: unknown[]) => adjust(...args), ApiError: api.ApiError }
})

import { CoinAdjustForm } from './CoinAdjustForm'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function fill(amount: string, comment: string) {
  fireEvent.change(screen.getByLabelText(/сумма/i), { target: { value: amount } })
  fireEvent.change(screen.getByLabelText(/комментарий/i), { target: { value: comment } })
}
const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: /^(применить|отправляем)/i }))

describe('<CoinAdjustForm>', () => {
  beforeEach(() => {
    adjust.mockReset()
    refresh.mockClear()
  })

  it('не отправляется без комментария', () => {
    render(<CoinAdjustForm customerId="c1" />)
    fill('500', '')
    submit()
    expect(adjust).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/комментарий/i)
  })

  it('не отправляется с комментарием короче 3 символов', () => {
    render(<CoinAdjustForm customerId="c1" />)
    fill('500', 'ab')
    submit()
    expect(adjust).not.toHaveBeenCalled()
  })

  it.each(['0', '', '-5', '1.5', '100001'])('не отправляется с суммой «%s»', (amount) => {
    render(<CoinAdjustForm customerId="c1" />)
    fill(amount, 'Компенсация за задержку')
    submit()
    expect(adjust).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('«Начислить» шлёт положительную сумму, затем показывает баланс и обновляет данные', async () => {
    adjust.mockResolvedValue({ balance: 500 })
    render(<CoinAdjustForm customerId="c1" />)
    fill('500', 'Компенсация за задержку')
    submit()
    await waitFor(() => expect(adjust).toHaveBeenCalledTimes(1))
    expect(adjust).toHaveBeenCalledWith('c1', {
      amount: 500,
      comment: 'Компенсация за задержку',
      requestId: expect.stringMatching(UUID_RE),
    })
    expect(await screen.findByText(/новый баланс: 500/i)).toBeInTheDocument()
    expect(refresh).toHaveBeenCalled()
  })

  it('«Списать» шлёт отрицательную сумму', async () => {
    adjust.mockResolvedValue({ balance: 300 })
    render(<CoinAdjustForm customerId="c1" />)
    fireEvent.click(screen.getByRole('radio', { name: 'Списать' }))
    fill('200', 'Возврат товара')
    submit()
    await waitFor(() => expect(adjust).toHaveBeenCalled())
    expect(adjust.mock.calls[0][1]).toMatchObject({ amount: -200 })
  })

  it('requestId не меняется после неудачной отправки и меняется после успешной', async () => {
    adjust.mockRejectedValueOnce(new Error('network'))
    render(<CoinAdjustForm customerId="c1" />)
    fill('100', 'Подарок покупателю')
    submit()
    await screen.findByRole('alert')
    adjust.mockResolvedValueOnce({ balance: 100 })
    submit()
    await waitFor(() => expect(adjust).toHaveBeenCalledTimes(2))
    const id1 = (adjust.mock.calls[0][1] as { requestId: string }).requestId
    const id2 = (adjust.mock.calls[1][1] as { requestId: string }).requestId
    expect(id2).toBe(id1)

    await screen.findByText(/новый баланс/i)
    adjust.mockResolvedValueOnce({ balance: 200 })
    fill('100', 'Ещё один подарок')
    submit()
    await waitFor(() => expect(adjust).toHaveBeenCalledTimes(3))
    const id3 = (adjust.mock.calls[2][1] as { requestId: string }).requestId
    expect(id3).not.toBe(id1)
    expect(id3).toMatch(UUID_RE)
  })

  it('409 insufficient_coins — понятное сообщение', async () => {
    adjust.mockRejectedValue(new ApiError(409, 'insufficient_coins', 'x'))
    render(<CoinAdjustForm customerId="c1" />)
    fireEvent.click(screen.getByRole('radio', { name: 'Списать' }))
    fill('600', 'Списание по просьбе')
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'На балансе меньше, чем вы списываете',
    )
    expect(refresh).not.toHaveBeenCalled()
  })

  it('409 request_id_conflict — просьба обновить страницу', async () => {
    adjust.mockRejectedValue(new ApiError(409, 'request_id_conflict', 'x'))
    render(<CoinAdjustForm customerId="c1" />)
    fill('600', 'Списание по просьбе')
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Этот запрос уже был отправлен с другими данными — обновите страницу',
    )
  })

  it('прочая ошибка API — её сообщение', async () => {
    adjust.mockRejectedValue(new ApiError(500, 'server_error', 'Что-то пошло не так'))
    render(<CoinAdjustForm customerId="c1" />)
    fill('10', 'Проверка ошибки')
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Что-то пошло не так')
  })

  it('пока запрос идёт — кнопка отключена, повторной отправки нет', async () => {
    let resolve!: (v: { balance: number }) => void
    adjust.mockReturnValue(new Promise((r) => (resolve = r)))
    render(<CoinAdjustForm customerId="c1" />)
    fill('10', 'Проверка двойной отправки')
    submit()
    const btn = await screen.findByRole('button', { name: /отправляем/i })
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(adjust).toHaveBeenCalledTimes(1)
    resolve({ balance: 10 })
    await screen.findByText(/новый баланс/i)
  })
})
