// Покупательский бот (вход в кабинет, спека 2026-09-28 §4.3). Отдельный от
// служебного бота заказов (bot.ts): другой токен, пишет покупателям в личку.

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const REQUEST_TIMEOUT_MS = 10_000

export type InlineButton = { text: string; callback_data: string } | { text: string; url: string }

export class TelegramLoginBot {
  readonly username: string
  readonly webhookSecret: string | null
  private readonly token: string
  private readonly fetchImpl: Fetch

  constructor(opts: {
    token: string
    username: string
    webhookSecret?: string | null
    fetch?: Fetch
  }) {
    this.token = opts.token
    this.username = opts.username.replace(/^@/, '')
    this.webhookSecret = opts.webhookSecret ?? null
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init))
  }

  private async call(method: string, payload: Record<string, unknown>): Promise<void> {
    const res = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify(payload),
    })
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean
      description?: string
    } | null
    if (!res.ok || !data?.ok) {
      throw new Error(`Telegram ${method} ${res.status}: ${data?.description ?? 'без описания'}`)
    }
  }

  sendMessage(chatId: number, text: string, buttons?: InlineButton[][]): Promise<void> {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    })
  }

  answerCallbackQuery(id: string, text?: string): Promise<void> {
    return this.call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) })
  }

  editMessageText(chatId: number, messageId: number, text: string): Promise<void> {
    return this.call('editMessageText', { chat_id: chatId, message_id: messageId, text })
  }

  setWebhook(url: string, secret: string): Promise<void> {
    return this.call('setWebhook', {
      url,
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    })
  }
}

let override: TelegramLoginBot | null = null

export function setLoginBotForTests(bot: TelegramLoginBot | null): void {
  override = bot
}

export function getLoginBot(env: NodeJS.ProcessEnv = process.env): TelegramLoginBot | null {
  if (override) return override
  const token = env.TELEGRAM_LOGIN_BOT_TOKEN?.trim()
  const username = env.TELEGRAM_LOGIN_BOT_USERNAME?.trim()
  if (!token || !username) return null
  return new TelegramLoginBot({
    token,
    username,
    webhookSecret: env.TELEGRAM_LOGIN_WEBHOOK_SECRET?.trim() || null,
  })
}
