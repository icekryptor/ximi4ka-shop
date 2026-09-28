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
