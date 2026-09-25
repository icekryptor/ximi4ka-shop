// Бот магазина пишет в рабочий чат (docs/superpowers/specs/2026-09-25-order-notifications-design.md).
// Отдельный от бота ERP: если ERP лежит, заказы всё равно приходят.

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

// Не дожидаемся зависшего соединения вечно — таймаут бросает исключение
// (не TelegramConfigError), обработчик очереди спланирует повтор.
const REQUEST_TIMEOUT_MS = 20_000

// Бот не в чате, неверный токен, битая разметка — повторять бессмысленно.
export class TelegramConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TelegramConfigError'
  }
}

export class TelegramBot {
  private readonly token: string
  private readonly chatId: string
  private readonly fetchImpl: Fetch

  constructor(opts: { token: string; chatId: string; fetch?: Fetch }) {
    this.token = opts.token
    this.chatId = opts.chatId
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init))
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): TelegramBot | null {
    const token = env.TELEGRAM_BOT_TOKEN
    const chatId = env.TELEGRAM_CHAT_ID
    if (!token || !chatId) return null
    return new TelegramBot({ token, chatId })
  }

  async sendMessage(html: string, replyTo?: number | null): Promise<number> {
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
    } | null
    if (res.ok && data?.ok && typeof data.result?.message_id === 'number')
      return data.result.message_id
    const message = `Telegram ${res.status}: ${data?.description ?? 'без описания'}`
    if (res.status === 400 || res.status === 401 || res.status === 403)
      throw new TelegramConfigError(message)
    throw new Error(message)
  }
}
