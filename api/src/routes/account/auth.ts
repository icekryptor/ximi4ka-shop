import { Router } from 'express'
import type { AuthConfig } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { CustomerSession } from '../../entities/CustomerSession.js'
import { getMailer } from '../../lib/mail/mailer.js'
import { clearCustomerSessionCookies } from '../../lib/account/session.js'
import { requireCustomerAuth, requireCustomerCsrf } from '../middleware/requireCustomerAuth.js'

// Бот появится в Task 5; до тех пор Telegram выключен.
function getLoginBotConfig(env: NodeJS.ProcessEnv = process.env): { username: string } | null {
  const token = env.TELEGRAM_LOGIN_BOT_TOKEN
  const username = env.TELEGRAM_LOGIN_BOT_USERNAME
  return token && username ? { username } : null
}

// Фабрика, а не модульный роутер: у каждого createApp() свои счётчики
// rateLimit — тесты создают приложение заново и не упираются в лимиты.
export function createAccountAuthRouter(): Router {
  const router = Router()

  router.get('/config', (_req, res) => {
    const bot = getLoginBotConfig()
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

  return router
}
