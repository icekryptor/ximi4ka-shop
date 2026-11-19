import { RateLimitError } from '../notifications/rateLimit.js'
import { telegramFetch } from './transport.js'

// Бот магазина пишет в рабочий чат (docs/superpowers/specs/2026-09-25-order-notifications-design.md).
// Отдельный от бота ERP: если ERP лежит, заказы всё равно приходят.

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

// Не дожидаемся зависшего соединения вечно — таймаут бросает исключение
// (не TelegramConfigError), обработчик очереди спланирует повтор.
const REQUEST_TIMEOUT_MS = 20_000
// Пауза после 429, если Telegram не сказал, сколько ждать.
const DEFAULT_RETRY_AFTER_MS = 30_000

// Бот не в чате, неверный или битый токен, битая разметка — повторять бессмысленно.
export class TelegramConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TelegramConfigError'
  }
}

export class TelegramBot {
  private readonly token: string
  // Не readonly: если группу превратили в супергруппу, Telegram сообщает новый
  // id, и бот переходит на него до перезапуска (см. sendMessage).
  private chatId: string
  private readonly fetchImpl: Fetch

  constructor(opts: { token: string; chatId: string; fetch?: Fetch }) {
    this.token = opts.token
    this.chatId = opts.chatId
    this.fetchImpl = opts.fetch ?? telegramFetch
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): TelegramBot | null {
    const token = env.TELEGRAM_BOT_TOKEN
    const chatId = env.TELEGRAM_CHAT_ID
    if (!token || !chatId) return null
    return new TelegramBot({ token, chatId })
  }

  async sendMessage(html: string, replyTo?: number | null): Promise<number> {
    return this.send(html, replyTo, true)
  }

  private async send(
    html: string,
    replyTo: number | null | undefined,
    mayFollowMigration: boolean,
  ): Promise<number> {
    const res = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        chat_id: this.chatId,
        text: html,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(replyTo
          ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } }
          : {}),
      }),
    })
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean
      result?: { message_id?: number }
      description?: string
      parameters?: { retry_after?: number; migrate_to_chat_id?: number }
    } | null
    if (res.ok && data?.ok && typeof data.result?.message_id === 'number')
      return data.result.message_id
    const message = `Telegram ${res.status}: ${data?.description ?? 'без описания'}`
    // Группу превратили в супергруппу (19.11.2026 так пропали 5 карточек):
    // старый id мёртв навсегда, новый Telegram называет сам. Переходим на него,
    // а в лог — точная строка для deploy/app.env, иначе после перезапуска api
    // каждая первая карточка будет тратить лишний запрос.
    const migrateTo = data?.parameters?.migrate_to_chat_id
    if (res.status === 400 && typeof migrateTo === 'number') {
      const newChatId = String(migrateTo)
      if (!mayFollowMigration || newChatId === this.chatId)
        throw new TelegramConfigError(`${message} (новый id ${newChatId})`)
      console.warn(
        `telegram: чат ${this.chatId} стал супергруппой, шлю в ${newChatId}. ` +
          `Поменяйте в deploy/app.env: TELEGRAM_CHAT_ID=${newChatId}`,
      )
      this.chatId = newChatId
      return this.send(html, replyTo, false)
    }
    if (res.status === 429) {
      const seconds = data?.parameters?.retry_after
      throw new RateLimitError(
        message,
        typeof seconds === 'number' && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS,
      )
    }
    // 404 — так Telegram отвечает на токен неверного формата.
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404)
      throw new TelegramConfigError(message)
    throw new Error(message)
  }
}
