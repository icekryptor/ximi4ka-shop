import { describe, it, expect, vi, afterEach } from 'vitest'
import { TelegramLoginBot, getLoginBot, isLoginBotUsable, setLoginBotForTests } from './loginBot.js'

function ok() {
  return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
}

describe('TelegramLoginBot', () => {
  afterEach(() => setLoginBotForTests(null))

  it('sendMessage шлёт inline-кнопки', async () => {
    const f = vi.fn().mockResolvedValue(ok())
    const bot = new TelegramLoginBot({ token: 'T', username: 'ximi4ka_bot', fetch: f })
    await bot.sendMessage(5, 'Войти?', [[{ text: 'Подтвердить вход', callback_data: 'login:1' }]])
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.telegram.org/botT/sendMessage')
    expect(JSON.parse(init.body)).toEqual({
      chat_id: 5,
      text: 'Войти?',
      reply_markup: { inline_keyboard: [[{ text: 'Подтвердить вход', callback_data: 'login:1' }]] },
    })
  })

  it('ошибка Telegram — исключение с описанием', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: false, description: 'Bad Request' }), { status: 400 }),
      )
    const bot = new TelegramLoginBot({ token: 'T', username: 'b', fetch: f })
    await expect(bot.answerCallbackQuery('q1')).rejects.toThrow(/Bad Request/)
  })

  it('setWebhook передаёт секрет и нужные типы update', async () => {
    const f = vi.fn().mockResolvedValue(ok())
    const bot = new TelegramLoginBot({ token: 'T', username: 'b', fetch: f })
    await bot.setWebhook('https://new.ximi4ka.ru/api/telegram/login-webhook', 's3cret')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
      url: 'https://new.ximi4ka.ru/api/telegram/login-webhook',
      secret_token: 's3cret',
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    })
  })

  it('getUpdates: offset, long polling и нужные типы update; отдаёт result', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, result: [{ update_id: 7 }] }), { status: 200 }),
      )
    const bot = new TelegramLoginBot({ token: 'T', username: 'b', fetch: f })
    expect(await bot.getUpdates(5)).toEqual([{ update_id: 7 }])
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.telegram.org/botT/getUpdates')
    expect(JSON.parse(init.body)).toEqual({
      offset: 5,
      timeout: 25,
      allowed_updates: ['message', 'callback_query'],
    })
  })

  it('getLoginBot: TELEGRAM_LOGIN_POLLING=1 — polling, годен и без секрета вебхука', () => {
    const env = { TELEGRAM_LOGIN_BOT_TOKEN: 'T', TELEGRAM_LOGIN_BOT_USERNAME: 'b' }
    expect(isLoginBotUsable(getLoginBot(env))).toBe(false)
    const polling = getLoginBot({ ...env, TELEGRAM_LOGIN_POLLING: '1' })
    expect(polling?.polling).toBe(true)
    expect(isLoginBotUsable(polling)).toBe(true)
    expect(isLoginBotUsable(getLoginBot({ ...env, TELEGRAM_LOGIN_WEBHOOK_SECRET: 's' }))).toBe(true)
    expect(isLoginBotUsable(null)).toBe(false)
  })

  it('getLoginBot: без токена или имени — null; с ними — бот', () => {
    expect(getLoginBot({})).toBeNull()
    expect(getLoginBot({ TELEGRAM_LOGIN_BOT_TOKEN: 'T' })).toBeNull()
    const bot = getLoginBot({
      TELEGRAM_LOGIN_BOT_TOKEN: 'T',
      TELEGRAM_LOGIN_BOT_USERNAME: '@ximi4ka_bot',
      TELEGRAM_LOGIN_WEBHOOK_SECRET: 's',
    })
    expect(bot?.username).toBe('ximi4ka_bot')
    expect(bot?.webhookSecret).toBe('s')
  })
})
