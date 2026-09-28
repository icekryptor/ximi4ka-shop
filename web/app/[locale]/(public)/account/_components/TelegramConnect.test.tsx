import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TelegramConnect } from './TelegramConnect'

const poll = vi.hoisted(() => vi.fn())
vi.mock('@/lib/accountApi', () => ({ pollTelegramLogin: poll }))

afterEach(() => {
  cleanup()
  poll.mockReset()
})

describe('TelegramConnect', () => {
  it('открывает бота и ждёт подтверждения', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    poll.mockResolvedValueOnce({ status: 'pending' }).mockResolvedValueOnce({ status: 'ok' })
    const onDone = vi.fn()
    render(
      <TelegramConnect
        label="Войти через Telegram"
        start={async () => ({ deepLink: 'https://t.me/ximi4ka_bot?start=abc' })}
        onDone={onDone}
        pollIntervalMs={10}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Войти через Telegram' }))
    expect(await screen.findByText(/Ждём подтверждения в Telegram/)).toBeInTheDocument()
    // window.open мог быть заблокирован — рядом всегда есть запасная ссылка
    // (final-fix-brief item 6: короче «ещё раз», раз это не всегда повтор).
    expect(screen.getByRole('link', { name: 'Открыть бота' })).toBeInTheDocument()
    expect(open).toHaveBeenCalledWith('https://t.me/ximi4ka_bot?start=abc', '_blank', 'noopener')
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('истёк — предлагает начать заново', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    poll.mockResolvedValue({ status: 'expired' })
    render(
      <TelegramConnect
        label="Войти через Telegram"
        start={async () => ({ deepLink: 'https://t.me/b?start=x' })}
        onDone={() => {}}
        pollIntervalMs={10}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Войти через Telegram' }))
    expect(await screen.findByRole('button', { name: 'Начать заново' })).toBeInTheDocument()
  })

  it('конфликт — этот Telegram уже привязан к другому аккаунту', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    poll.mockResolvedValue({ status: 'conflict' })
    render(
      <TelegramConnect
        label="Войти через Telegram"
        start={async () => ({ deepLink: 'https://t.me/b?start=x' })}
        onDone={() => {}}
        pollIntervalMs={10}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Войти через Telegram' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Этот Telegram уже привязан к другому аккаунту — войдите через Telegram и привяжите почту там.',
    )
    expect(screen.getByRole('button', { name: 'Начать заново' })).toBeInTheDocument()
  })
})
