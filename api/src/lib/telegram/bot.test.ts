import { describe, it, expect, vi } from 'vitest'
import { TelegramBot, TelegramConfigError } from './bot.js'
import { RateLimitError } from '../notifications/rateLimit.js'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function bot(fetchMock: ReturnType<typeof vi.fn>) {
  return new TelegramBot({ token: 'TOKEN', chatId: '-1001234', fetch: fetchMock })
}

describe('TelegramBot', () => {
  it('шлёт HTML в рабочий чат и возвращает message_id', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { ok: true, result: { message_id: 77 } }))
    expect(await bot(f).sendMessage('<b>Новый заказ</b>')).toBe(77)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.telegram.org/botTOKEN/sendMessage')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      chat_id: '-1001234',
      text: '<b>Новый заказ</b>',
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    })
  })

  it('ответ на карточку — reply_parameters, даже если карточку удалили', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { ok: true, result: { message_id: 78 } }))
    await bot(f).sendMessage('✅ оплачен', 77)
    expect(JSON.parse(f.mock.calls[0][1].body).reply_parameters).toEqual({
      message_id: 77,
      allow_sending_without_reply: true,
    })
  })

  it('400/401/403 — ошибка настройки с описанием Telegram', async () => {
    const f = vi.fn().mockResolvedValue(
      json(403, {
        ok: false,
        error_code: 403,
        description: 'Forbidden: bot was kicked from the group chat',
      }),
    )
    const err = await bot(f)
      .sendMessage('x')
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TelegramConfigError)
    expect((err as Error).message).toMatch(/kicked/)
  })

  it('5xx — временная ошибка', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(json(502, { ok: false, error_code: 502, description: 'Bad Gateway' }))
    const err = await bot(f)
      .sendMessage('x')
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(TelegramConfigError)
    expect(err).not.toBeInstanceOf(RateLimitError)
  })

  it('429 — RateLimitError с паузой из parameters.retry_after', async () => {
    const f = vi.fn().mockResolvedValue(
      json(429, {
        ok: false,
        error_code: 429,
        description: 'Too Many Requests: retry after 41',
        parameters: { retry_after: 41 },
      }),
    )
    const err = await bot(f)
      .sendMessage('x')
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RateLimitError)
    expect(err).not.toBeInstanceOf(TelegramConfigError)
    expect((err as RateLimitError).retryAfterMs).toBe(41_000)
    expect((err as Error).message).not.toContain('TOKEN')
  })

  it('429 без retry_after — пауза 30 с', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        json(429, { ok: false, error_code: 429, description: 'Too Many Requests' }),
      )
    const err = await bot(f)
      .sendMessage('x')
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RateLimitError)
    expect((err as RateLimitError).retryAfterMs).toBe(30_000)
  })

  it('fromEnv без токена или чата — null', () => {
    expect(TelegramBot.fromEnv({})).toBeNull()
    expect(TelegramBot.fromEnv({ TELEGRAM_BOT_TOKEN: 't' })).toBeNull()
    expect(TelegramBot.fromEnv({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '-1' })).toBeInstanceOf(
      TelegramBot,
    )
  })
})
