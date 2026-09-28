import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { Customer } from '../entities/Customer.js'
import { TelegramLoginRequest } from '../entities/TelegramLoginRequest.js'
import { TelegramLoginBot, setLoginBotForTests } from '../lib/telegram/loginBot.js'
import { customerAuthFrom, resetAccountTables } from './testUtils.js'

const SECRET = 'hook-secret'

function fakeBot() {
  const calls: Array<{ method: string; body: Record<string, unknown> }> = []
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ method: url.split('/').pop()!, body: JSON.parse(String(init?.body)) })
    return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
  })
  const bot = new TelegramLoginBot({
    token: 'T',
    username: 'ximi4ka_bot',
    webhookSecret: SECRET,
    fetch: f,
  })
  return { bot, calls }
}

describe('вход через Telegram', () => {
  let app: ReturnType<typeof createApp>
  let calls: ReturnType<typeof fakeBot>['calls']
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    const fake = fakeBot()
    calls = fake.calls
    setLoginBotForTests(fake.bot)
    app = createApp()
  })
  afterEach(() => setLoginBotForTests(null))

  async function startLogin() {
    const agent = request.agent(app)
    const res = await agent.post('/api/account/auth/telegram/start')
    expect(res.status).toBe(200)
    const nonce = new URL(res.body.data.deepLink).searchParams.get('start')!
    expect(res.body.data.deepLink).toMatch(/^https:\/\/t\.me\/ximi4ka_bot\?start=/)
    return { agent, nonce }
  }

  const hook = (update: unknown, secret = SECRET) =>
    request(app)
      .post('/api/telegram/login-webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', secret)
      .send(update)

  const startMsg = (nonce: string, fromId = 1001) => ({
    update_id: 1,
    message: {
      message_id: 10,
      chat: { id: fromId, type: 'private' },
      from: { id: fromId, username: 'ivan_tg', first_name: 'Иван' },
      text: `/start ${nonce}`,
    },
  })

  const confirm = (requestId: string, fromId = 1001) => ({
    update_id: 2,
    callback_query: {
      id: 'cb1',
      from: { id: fromId, username: 'ivan_tg', first_name: 'Иван' },
      message: { message_id: 11, chat: { id: fromId, type: 'private' } },
      data: `login:${requestId}`,
    },
  })

  function lastButtonData(): string {
    const send = calls.filter((c) => c.method === 'sendMessage').pop()!
    const markup = send.body.reply_markup as {
      inline_keyboard: Array<Array<{ callback_data: string }>>
    }
    return markup.inline_keyboard[0][0].callback_data
  }

  it('полный поток: start → /start → Подтвердить → status ok → сессия', async () => {
    const { agent, nonce } = await startLogin()
    expect((await agent.get('/api/account/auth/telegram/status')).body.data.status).toBe('pending')

    expect((await hook(startMsg(nonce))).status).toBe(200)
    // «Старт» ещё никого не логинит.
    expect((await agent.get('/api/account/auth/telegram/status')).body.data.status).toBe('pending')

    const data = lastButtonData()
    expect(data).toMatch(/^login:/)
    await hook(confirm(data.slice('login:'.length)))
    expect(calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true)
    expect(calls.some((c) => c.method === 'editMessageText')).toBe(true)

    const done = await agent.get('/api/account/auth/telegram/status')
    expect(done.body.data.status).toBe('ok')
    customerAuthFrom(done.headers['set-cookie'])
    const c = await AppDataSource.getRepository(Customer).findOneByOrFail({ telegramId: 1001 })
    expect(c.telegramUsername).toBe('ivan_tg')
    expect(c.name).toBe('Иван')
  })

  it('повторный вход тем же Telegram — тот же покупатель, username обновлён', async () => {
    await AppDataSource.getRepository(Customer).save({ telegramId: 1001, telegramUsername: 'old' })
    const { agent, nonce } = await startLogin()
    await hook(startMsg(nonce))
    await hook(confirm(lastButtonData().slice(6)))
    expect((await agent.get('/api/account/auth/telegram/status')).body.data.status).toBe('ok')
    const all = await AppDataSource.getRepository(Customer).find()
    expect(all).toHaveLength(1)
    expect(all[0].telegramUsername).toBe('ivan_tg')
  })

  it('«Подтвердить» от другого Telegram-аккаунта не подтверждает вход', async () => {
    const { agent, nonce } = await startLogin()
    await hook(startMsg(nonce, 1001))
    await hook(confirm(lastButtonData().slice(6), 2002))
    expect((await agent.get('/api/account/auth/telegram/status')).body.data.status).toBe('pending')
  })

  it('гонка «Старт»/«Подтвердить»: telegramId переписан между проверкой и записью — не подтверждает', async () => {
    const { agent, nonce } = await startLogin()
    await hook(startMsg(nonce, 1001))
    const data = lastButtonData()
    // Имитируем интерливинг: между чтением заявки в обработчике callback_query
    // и его UPDATE параллельный «Старт» другого пользователя успел
    // переписать telegramId. Проверяем, что UPDATE с условием telegramId
    // видит расхождение и не подтверждает вход.
    // repo.update({}, …) бросает «Empty criteria(s)» в typeorm@0.3.28 — через
    // query builder (в тесте всегда одна строка).
    await AppDataSource.getRepository(TelegramLoginRequest)
      .createQueryBuilder()
      .update(TelegramLoginRequest)
      .set({ telegramId: 2002 })
      .execute()
    await hook(confirm(data.slice('login:'.length), 1001))
    expect(calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true)
    const answer = calls.filter((c) => c.method === 'answerCallbackQuery').pop()!
    expect(String(answer.body.text)).toMatch(/устарела/)
    expect(calls.some((c) => c.method === 'editMessageText')).toBe(false)
    expect((await agent.get('/api/account/auth/telegram/status')).body.data.status).toBe('pending')
  })

  it('два опроса подтверждённого запроса — сессию получает только один', async () => {
    const { agent, nonce } = await startLogin()
    await hook(startMsg(nonce))
    await hook(confirm(lastButtonData().slice(6)))
    const [a, b] = await Promise.all([
      agent.get('/api/account/auth/telegram/status'),
      agent.get('/api/account/auth/telegram/status'),
    ])
    const statuses = [a.body.data.status, b.body.data.status].sort()
    expect(statuses).toEqual(['expired', 'ok'])
  })

  it('неверный секрет webhook — 401', async () => {
    const res = await hook(startMsg('x'), 'wrong')
    expect(res.status).toBe(401)
  })

  it('неизвестный nonce — бот пишет, что ссылка устарела; статус без cookie — expired', async () => {
    expect((await hook(startMsg('nope'))).status).toBe(200)
    const sent = calls.find((c) => c.method === 'sendMessage')!
    expect(String(sent.body.text)).toMatch(/устарела/)
    expect((await request(app).get('/api/account/auth/telegram/status')).body.data.status).toBe(
      'expired',
    )
  })

  it('истёкший запрос — expired', async () => {
    const { agent, nonce } = await startLogin()
    // repo.update({}, …) в typeorm@0.3.28 бросает «Empty criteria(s) are not
    // allowed» — обходим через query builder (в тесте всегда одна строка).
    await AppDataSource.getRepository(TelegramLoginRequest)
      .createQueryBuilder()
      .update(TelegramLoginRequest)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .execute()
    await hook(startMsg(nonce))
    expect((await agent.get('/api/account/auth/telegram/status')).body.data.status).toBe('expired')
  })

  it('бот не настроен — start 503', async () => {
    setLoginBotForTests(null)
    const res = await request(app).post('/api/account/auth/telegram/start')
    expect(res.status).toBe(503)
  })

  it('сбой Telegram при ответе — webhook всё равно 200', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = new TelegramLoginBot({
      token: 'T',
      username: 'ximi4ka_bot',
      webhookSecret: SECRET,
      fetch: async () => new Response('{"ok":false}', { status: 500 }),
    })
    setLoginBotForTests(broken)
    const { nonce } = await startLogin()
    expect((await hook(startMsg(nonce))).status).toBe(200)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
