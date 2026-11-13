import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CoinsCard } from './CoinsCard'

const getCoins = vi.hoisted(() => vi.fn())
vi.mock('@/lib/accountApi', () => ({ getCoins }))
afterEach(() => {
  cleanup()
  getCoins.mockReset()
})

const tx = (id: string, amount: number, kind: string, orderNumber: string | null, extra = {}) => ({
  id,
  amount,
  kind,
  orderNumber,
  comment: null,
  createdAt: '2026-09-20T10:00:00.000Z',
  ...extra,
})

describe('CoinsCard', () => {
  it('баланс и ожидающее начисление', async () => {
    getCoins.mockResolvedValue({ balance: 190, pending: 380, transactions: [] })
    render(<CoinsCard programEnabled />)
    expect(await screen.findByTestId('coins-balance')).toHaveTextContent('190')
    expect(screen.getByText(/Ожидает начисления: 380/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Правила программы' })).toHaveAttribute(
      'href',
      '/himikoiny',
    )
  })

  it('pending = 0 — строка скрыта', async () => {
    getCoins.mockResolvedValue({ balance: 190, pending: 0, transactions: [] })
    render(<CoinsCard programEnabled />)
    await screen.findByTestId('coins-balance')
    expect(screen.queryByText(/Ожидает начисления/)).toBeNull()
  })

  it('пустая история — подсказка', async () => {
    getCoins.mockResolvedValue({ balance: 0, pending: 0, transactions: [] })
    render(<CoinsCard programEnabled />)
    expect(
      await screen.findByText('Химикоины придут после получения первого заказа'),
    ).toBeInTheDocument()
  })

  it('три вида операций: подписи, знаки, дата; комментарий админа не выводится', async () => {
    getCoins.mockResolvedValue({
      balance: 40,
      pending: 0,
      transactions: [
        tx('1', 190, 'order_cashback', 'XM-2026-00001'),
        tx('2', -150, 'order_cashback_revoke', 'XM-2026-00002'),
        tx('3', 50, 'admin_adjust', null, { comment: 'СЕКРЕТ-КОММЕНТАРИЙ' }),
      ],
    })
    render(<CoinsCard programEnabled />)
    expect(await screen.findByText('Кэшбек за заказ №XM-2026-00001')).toBeInTheDocument()
    expect(screen.getByText('Отмена заказа №XM-2026-00002')).toBeInTheDocument()
    expect(screen.getByText('Корректировка')).toBeInTheDocument()
    expect(screen.getByText('+190')).toBeInTheDocument()
    expect(screen.getByText('−150')).toBeInTheDocument()
    expect(screen.getByText('+50')).toBeInTheDocument()
    expect(screen.getAllByText(/20 сентября 2026/)).toHaveLength(3)
    expect(screen.queryByText(/СЕКРЕТ-КОММЕНТАРИЙ/)).toBeNull()
  })

  it('программа выключена и ничего нет — карточка не рисуется', async () => {
    getCoins.mockResolvedValue({ balance: 0, pending: 0, transactions: [] })
    const { container } = render(<CoinsCard programEnabled={false} />)
    await waitFor(() => expect(getCoins).toHaveBeenCalled())
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('программа выключена, но есть баланс или история — карточка есть', async () => {
    getCoins.mockResolvedValue({ balance: 100, pending: 0, transactions: [] })
    render(<CoinsCard programEnabled={false} />)
    expect(await screen.findByTestId('coins-balance')).toHaveTextContent('100')
    cleanup()
    getCoins.mockResolvedValue({
      balance: 0,
      pending: 0,
      transactions: [tx('1', 10, 'admin_adjust', null)],
    })
    render(<CoinsCard programEnabled={false} />)
    expect(await screen.findByText('Корректировка')).toBeInTheDocument()
  })

  it('ошибка — короткое сообщение и повтор', async () => {
    getCoins.mockRejectedValueOnce(new Error('boom'))
    render(<CoinsCard programEnabled />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Не удалось загрузить/)
    getCoins.mockResolvedValue({ balance: 5, pending: 0, transactions: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByTestId('coins-balance')).toHaveTextContent('5')
  })

  it('пока грузится — резерв высоты', () => {
    getCoins.mockReturnValue(new Promise(() => {}))
    render(<CoinsCard programEnabled />)
    expect(screen.getByTestId('coins-skeleton')).toBeInTheDocument()
  })
})
