import nodemailer, { type Transporter } from 'nodemailer'

// Почта витрины: коды входа в кабинет (спека кабинета §7). SMTP ящика домена;
// без SMTP_HOST вне прода письма копятся в памяти и печатаются в лог — так
// работают dev и тесты. В проде без SMTP почты нет: вход по email выключен.

export interface MailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>
  // Проверка входа в SMTP без отправки письма (nodemailer transport.verify).
  verify?(): Promise<void>
}

// Здоровье почты. Пока SMTP не пускает (17.11.2026 Яндекс отключил ящику SMTP,
// и три дня каждый вход по почте кончался «Не удалось отправить письмо»),
// форма прячет вход по почте и оставляет Telegram — как с недоступным ботом.
// Отказ по конкретному получателю (EENVELOPE) — не поломка почты.
type MailHealth = { healthy: boolean; lastError: string | null; since: number }
let health: MailHealth = { healthy: true, lastError: null, since: Date.now() }

export function getMailHealth(): MailHealth {
  return health
}

export function recordMailSuccess(): void {
  if (!health.healthy) health = { healthy: true, lastError: null, since: Date.now() }
}

export function recordMailFailure(err: unknown): void {
  if ((err as { code?: string } | null)?.code === 'EENVELOPE') return
  const message = err instanceof Error ? err.message : String(err)
  if (health.healthy) health = { healthy: false, lastError: message, since: Date.now() }
  else health = { ...health, lastError: message }
}

export function resetMailHealthForTests(): void {
  health = { healthy: true, lastError: null, since: Date.now() }
}

// Пробует войти в SMTP. Вызывается по таймеру (startMailHealthProbe): так почта
// возвращается в форму сама, когда ящик снова пустят, — без чьих-то попыток входа.
export async function probeMailHealth(): Promise<void> {
  const mailer = getMailer()
  if (!mailer?.verify) return
  try {
    await mailer.verify()
    if (!health.healthy) console.log('mail: SMTP снова принимает вход — вход по почте включён')
    recordMailSuccess()
  } catch (err) {
    if (health.healthy) {
      console.error(
        `mail: SMTP не пускает — вход по почте скрыт до восстановления: ${(err as Error).message}`,
      )
    }
    recordMailFailure(err)
  }
}

export function startMailHealthProbe(intervalMs = 5 * 60 * 1000): boolean {
  if (!process.env.SMTP_HOST?.trim()) return false
  void probeMailHealth()
  setInterval(() => void probeMailHealth(), intervalMs).unref()
  return true
}

export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at < 1) return '***'
  return `${email[0]}***${email.slice(at)}`
}

export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = []

  async send(msg: MailMessage): Promise<void> {
    this.sent.push(msg)
    if (process.env.NODE_ENV !== 'test') {
      // Только вне прода: сюда не попадаем, если SMTP настроен или NODE_ENV=production.
      console.log(`mail (dev): ${maskEmail(msg.to)} — ${msg.subject}\n${msg.text}`)
    }
  }

  lastCodeFor(email: string): string | null {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const m = this.sent[i]
      if (m.to !== email) continue
      const match = m.text.match(/\b(\d{6})\b/)
      if (match) return match[1]
    }
    return null
  }
}

class SmtpMailer implements Mailer {
  constructor(
    private readonly transport: Transporter,
    private readonly from: string,
  ) {}

  async send(msg: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...msg })
  }

  async verify(): Promise<void> {
    await this.transport.verify()
  }
}

let override: Mailer | null = null
let devMailer: MemoryMailer | null = null
let smtpCache: { key: string; mailer: SmtpMailer } | null = null

export function setMailerForTests(m: Mailer | null): void {
  override = m
}

// Читает env на каждый вызов: тест или перезапуск с другим env не требуют
// пересборки модуля. Транспорт кешируется по конфигу.
export function getMailer(env: NodeJS.ProcessEnv = process.env): Mailer | null {
  if (override) return override
  const host = env.SMTP_HOST?.trim()
  if (!host) {
    if (env.NODE_ENV === 'production') return null
    devMailer ??= new MemoryMailer()
    return devMailer
  }
  const port = Number(env.SMTP_PORT ?? 465)
  const secure = (env.SMTP_SECURE ?? (port === 465 ? 'true' : 'false')) === 'true'
  const user = env.SMTP_USER ?? ''
  const from = env.MAIL_FROM ?? user
  const key = [host, port, secure, user, env.SMTP_PASS ?? '', from].join('|')
  if (smtpCache?.key !== key) {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass: env.SMTP_PASS ?? '' } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
    smtpCache = { key, mailer: new SmtpMailer(transport, from) }
  }
  return smtpCache.mailer
}
