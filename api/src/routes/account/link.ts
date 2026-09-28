import { Router } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { Customer } from '../../entities/Customer.js'
import { ApiError, badRequest, conflict } from '../errors.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { requireCustomerAuth, requireCustomerCsrf } from '../middleware/requireCustomerAuth.js'
import { EmailStartSchema, EmailVerifySchema } from './schemas.js'
import { sendLoginCode, setTelegramPollCookie } from './auth.js'
import { verifyEmailCode } from '../../lib/account/emailCodes.js'
import { attachEmail } from '../../lib/account/customers.js'
import { createTelegramLoginRequest } from '../../lib/account/telegramLogin.js'
import { getLoginBot } from '../../lib/telegram/loginBot.js'

// Привязка второго способа входа, слияние аккаунтов, отвязка (спека §4.5).
// Всё требует активной сессии — привязать можно только к себе.
export function createAccountLinkRouter(): Router {
  const router = Router()
  router.use(requireCustomerAuth, requireCustomerCsrf)

  router.post(
    '/link/email/start',
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
    '/link/email/verify',
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
        await AppDataSource.transaction((em) => attachEmail(em, req.customer!.id, email))
        res.json({ data: { ok: true } })
      } catch (err) {
        next(err)
      }
    },
  )

  router.post(
    '/link/telegram/start',
    rateLimit({ limit: 30, windowMs: 60 * 60 * 1000 }),
    async (req, res, next) => {
      try {
        const bot = getLoginBot()
        if (!bot)
          throw new ApiError(503, 'telegram_login_unavailable', 'Вход через Telegram недоступен')
        const { nonce, pollSecret } = await createTelegramLoginRequest(req.customer!.id)
        setTelegramPollCookie(res, pollSecret)
        res.json({ data: { deepLink: `https://t.me/${bot.username}?start=${nonce}` } })
      } catch (err) {
        next(err)
      }
    },
  )

  router.post('/email/unlink', async (req, res, next) => {
    try {
      if (req.customer!.telegramId === null)
        throw conflict('last_login_method', 'Это единственный способ входа')
      await AppDataSource.getRepository(Customer).update({ id: req.customer!.id }, { email: null })
      res.status(204).end()
    } catch (err) {
      next(err)
    }
  })

  router.post('/telegram/unlink', async (req, res, next) => {
    try {
      if (req.customer!.email === null)
        throw conflict('last_login_method', 'Это единственный способ входа')
      await AppDataSource.getRepository(Customer).update(
        { id: req.customer!.id },
        { telegramId: null, telegramUsername: null },
      )
      res.status(204).end()
    } catch (err) {
      next(err)
    }
  })

  return router
}
