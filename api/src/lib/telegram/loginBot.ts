import { describeNetworkError, isNetworkError, telegramFetch } from './transport.js'

// Покупательский бот (вход в кабинет, спека 2026-09-28 §4.3). Отдельный от
// служебного бота заказов (bot.ts): другой токен, пишет покупателям в личку.

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const REQUEST_TIMEOUT_MS = 10_000
// Long polling: Telegram держит getUpdates до POLL_TIMEOUT_SEC, если новых
// update нет; сетевой таймаут — с запасом сверху.
// Коротко: простаивающее соединение до Telegram у нас рвётся посреди пути.
export const POLL_TIMEOUT_SEC = 10
const POLL_REQUEST_TIMEOUT_MS = (POLL_TIMEOUT_SEC + 10) * 1000

// Минимум полей, которые нужны циклу опроса; разбор — в telegramLogin.ts.
export interface PolledUpdate {
  update_id: number
  [key: string]: unknown
}

export type InlineButton = { text: string; callback_data: string } | { text: string; url: string }

export class TelegramLoginBot {
  readonly username: string
  readonly webhookSecret: string | null
  // Забирать update через getUpdates, а не ждать вебхук. Для сервера, до
  // которого Telegram не может достучаться (у нас — IPv4 до Telegram закрыт
  // в обе стороны, а вебхуки Telegram шлёт только по IPv4).
  readonly polling: boolean
  private readonly token: string
  private readonly fetchImpl: Fetch

  constructor(opts: {
    token: string
    username: string
    webhookSecret?: string | null
    polling?: boolean
    fetch?: Fetch
  }) {
    this.token = opts.token
    this.username = opts.username.replace(/^@/, '')
    this.webhookSecret = opts.webhookSecret ?? null
    this.polling = opts.polling ?? false
    this.fetchImpl = opts.fetch ?? telegramFetch
  }

  private async call<T = unknown>(
    method: string,
    payload: Record<string, unknown>,
    timeoutMs = REQUEST_TIMEOUT_MS,
    retryOnNetworkError = true,
  ): Promise<T> {
    const send = () =>
      this.fetchImpl(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify(payload),
      })
    let res: Response
    try {
      res = await send()
    } catch (err) {
      // Один повтор при обрыве сети: ответ «подтвердите вход» важнее
      // редкого дубля сообщения. getUpdates не повторяем — это делает цикл.
      if (!retryOnNetworkError || !isNetworkError(err)) {
        throw new Error(`Telegram ${method}: ${describeNetworkError(err)}`)
      }
      try {
        res = await send()
      } catch (err2) {
        throw new Error(`Telegram ${method}: ${describeNetworkError(err2)}`)
      }
    }
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean
      description?: string
      result?: T
    } | null
    if (!res.ok || !data?.ok) {
      throw new Error(`Telegram ${method} ${res.status}: ${data?.description ?? 'без описания'}`)
    }
    return data.result as T
  }

  async sendMessage(chatId: number, text: string, buttons?: InlineButton[][]): Promise<void> {
    await this.call('sendMessage', {
      chat_id: chatId,
      text,
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    })
  }

  async answerCallbackQuery(id: string, text?: string): Promise<void> {
    await this.call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) })
  }

  async editMessageText(chatId: number, messageId: number, text: string): Promise<void> {
    await this.call('editMessageText', { chat_id: chatId, message_id: messageId, text })
  }

  async getUpdates(offset: number | undefined): Promise<PolledUpdate[]> {
    const result = await this.call<PolledUpdate[]>(
      'getUpdates',
      {
        ...(offset !== undefined ? { offset } : {}),
        timeout: POLL_TIMEOUT_SEC,
        allowed_updates: ['message', 'callback_query'],
      },
      POLL_REQUEST_TIMEOUT_MS,
      false,
    )
    return Array.isArray(result) ? result : []
  }

  // Пока у бота есть вебхук, getUpdates отвечает 409 — снимаем его перед опросом.
  async deleteWebhook(): Promise<void> {
    await this.call('deleteWebhook', { drop_pending_updates: false })
  }

  async setWebhook(url: string, secret: string): Promise<void> {
    await this.call('setWebhook', {
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
    polling: env.TELEGRAM_LOGIN_POLLING?.trim() === '1',
  })
}

// Бот принимает update: либо сам их забирает (polling), либо есть секрет
// вебхука (без него вебхук отвечает 404 — см. loginWebhook.ts).
export function isLoginBotUsable(bot: TelegramLoginBot | null): bot is TelegramLoginBot {
  return bot !== null && (bot.polling || bot.webhookSecret !== null)
}
