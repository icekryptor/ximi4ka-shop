import { Router } from 'express'
import type { Response } from 'express'
import type { AuthConfig } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { CustomerSession } from '../../entities/CustomerSession.js'
import { getMailer } from '../../lib/mail/mailer.js'
import { getLoginBot } from '../../lib/telegram/loginBot.js'
import {
  clearCustomerSessionCookies,
  cookieBase,
  startCustomerSession,
} from '../../lib/account/session.js'
import { requireCustomerAuth, requireCustomerCsrf } from '../middleware/requireCustomerAuth.js'
import { ApiError, badRequest } from '../errors.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { EmailStartSchema, EmailVerifySchema } from './schemas.js'
import { discardEmailCode, issueEmailCode, verifyEmailCode } from '../../lib/account/emailCodes.js'
import {
  attachTelegram,
  claimOrdersByEmail,
  findOrCreateByEmail,
  findOrCreateByTelegram,
} from '../../lib/account/customers.js'
import { maskEmail } from '../../lib/mail/mailer.js'
import { Customer } from '../../entities/Customer.js'
import {
  consumeConfirmedRequest,
  createTelegramLoginRequest,
} from '../../lib/account/telegramLogin.js'
import { findCustomerSession } from '../../lib/account/session.js'
import { TG_LOGIN_TTL_MS, TG_POLL_COOKIE } from './constants.js'

// Выпуск кода и письмо. Бросает ApiError: 503 — почта не настроена, 429 —
// лимит (со Retry-After на res, если он передан), 502 — SMTP не принял
// письмо (код удалён, повтор сразу возможен).
export async function sendLoginCode(email: string, res?: Response): Promise<void> {
  const mailer = getMailer()
  if (!mailer) {
    throw new ApiError(503, 'email_login_unavailable', 'Вход по почте временно недоступен')
  }
  const issued = await issueEmailCode(email)
  if (!issued.ok) {
    res?.setHeader('Retry-After', String(issued.retryAfterSec))
    throw new ApiError(
      429,
      issued.reason === 'too_soon' ? 'code_too_soon' : 'code_hourly_limit',
      issued.reason === 'too_soon'
        ? 'Код уже отправлен — новый можно запросить через минуту'
        : 'Слишком много писем на этот адрес — попробуйте через час',
      { retryAfterSec: issued.retryAfterSec },
    )
  }
  try {
    await mailer.send({
      to: email,
      subject: `Код для входа: ${issued.code}`,
      text: `Код для входа на ximi4ka.ru: ${issued.code}\n\nОн действует 10 минут. Если вы не запрашивали код, просто удалите это письмо.`,
      html: `<p>Код для входа на ximi4ka.ru:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${issued.code}</p><p>Он действует 10 минут. Если вы не запрашивали код, просто удалите это письмо.</p>`,
    })
  } catch (err) {
    await discardEmailCode(issued.id)
    console.error(
      `account: письмо с кодом на ${maskEmail(email)} не ушло — ${(err as Error).message}`,
    )
    throw new ApiError(502, 'email_send_failed', 'Не удалось отправить письмо — попробуйте ещё раз')
  }
}

export function setTelegramPollCookie(res: Response, pollSecret: string): void {
  res.cookie(TG_POLL_COOKIE, pollSecret, {
    ...cookieBase(),
    httpOnly: true,
    maxAge: TG_LOGIN_TTL_MS,
  })
}

// Фабрика, а не модульный роутер: у каждого createApp() свои счётчики
// rateLimit — тесты создают приложение заново и не упираются в лимиты.
export function createAccountAuthRouter(): Router {
  const router = Router()

  router.get('/config', (_req, res) => {
    const bot = getLoginBot()
    const data: AuthConfig = {
      email: getMailer() !== null,
      telegram: bot !== null,
      telegramBot: bot?.username ?? null,
    }
    res.json({ data })
  })

  router.post('/logout', requireCustomerAuth, requireCustomerCsrf, async (req, res, next) => {
    try {
      await AppDataSource.getRepository(CustomerSession).update(
        { id: req.customerSession!.id },
        { revokedAt: new Date() },
      )
      clearCustomerSessionCookies(res)
      res.status(204).end()
    } catch (err) {
      next(err)
    }
  })

  router.post(
    '/email/start',
    rateLimit({ limit: 20, windowMs: 60 * 60 * 1000 }),
    async (req, res, next) => {
      try {
        const { email } = EmailStartSchema.parse(req.body)
        await sendLoginCode(email, res)
        res.status(204).end()
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    '/email/verify',
    rateLimit({ limit: 60, windowMs: 15 * 60 * 1000 }),
    async (req, res, next) => {
      try {
        const { email, code } = EmailVerifySchema.parse(req.body)
        const result = await verifyEmailCode(email, code)
        if (!result.ok) {
          throw result.reason === 'invalid_code'
            ? badRequest('invalid_code', 'Неверный код', { attemptsLeft: result.attemptsLeft })
            : badRequest('code_expired', 'Код устарел — запросите новый')
        }
        const customer = await AppDataSource.transaction(async (em) => {
          const c = await findOrCreateByEmail(em, email)
          await claimOrdersByEmail(em, c.id, email)
          await em.getRepository(Customer).update({ id: c.id }, { lastLoginAt: new Date() })
          return c
        })
        await startCustomerSession(req, res, customer.id)
        res.json({ data: { ok: true } })
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    '/telegram/start',
    rateLimit({ limit: 30, windowMs: 60 * 60 * 1000 }),
    async (_req, res, next) => {
      try {
        const bot = getLoginBot()
        if (!bot)
          throw new ApiError(503, 'telegram_login_unavailable', 'Вход через Telegram недоступен')
        const { nonce, pollSecret } = await createTelegramLoginRequest(null)
        setTelegramPollCookie(res, pollSecret)
        res.json({ data: { deepLink: `https://t.me/${bot.username}?start=${nonce}` } })
      } catch (err) {
        next(err)
      }
    },
  )

  // 300 запросов за 10 минут: опрос раз в 2 с — это 300 за весь срок запроса.
  router.get(
    '/telegram/status',
    rateLimit({ limit: 600, windowMs: 10 * 60 * 1000 }),
    async (req, res, next) => {
      try {
        const pollSecret = req.cookies?.[TG_POLL_COOKIE]
        if (typeof pollSecret !== 'string' || !pollSecret) {
          res.json({ data: { status: 'expired' } })
          return
        }
        const result = await consumeConfirmedRequest(pollSecret)
        if (result.status !== 'confirmed') {
          res.json({ data: { status: result.status } })
          return
        }
        res.clearCookie(TG_POLL_COOKIE, { ...cookieBase(), httpOnly: true })
        const r = result.request
        if (r.linkCustomerId) {
          // Привязываем, только если опрашивает та же сессия, что начинала
          // привязку: cookie опроса без сессии (или с чужой) ничего не даёт.
          const found = await findCustomerSession(req)
          if (!found || found.customer.id !== r.linkCustomerId) {
            res.json({ data: { status: 'expired' } })
            return
          }
          await AppDataSource.transaction((em) =>
            attachTelegram(em, found.customer.id, {
              id: r.telegramId!,
              username: r.telegramUsername,
              firstName: r.telegramFirstName,
            }),
          )
          res.json({ data: { status: 'ok' } })
          return
        }
        const customer = await AppDataSource.transaction((em) =>
          findOrCreateByTelegram(em, {
            id: r.telegramId!,
            username: r.telegramUsername,
            firstName: r.telegramFirstName,
          }),
        )
        await startCustomerSession(req, res, customer.id)
        res.json({ data: { status: 'ok' } })
      } catch (err) {
        next(err)
      }
    },
  )

  return router
}
