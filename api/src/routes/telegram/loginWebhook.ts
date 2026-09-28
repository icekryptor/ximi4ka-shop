import { timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { getLoginBot } from '../../lib/telegram/loginBot.js'
import { handleTelegramUpdate, type TelegramUpdate } from '../../lib/account/telegramLogin.js'
import { rateLimit } from '../middleware/rateLimit.js'

function secretMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// POST /api/telegram/login-webhook — update покупательского бота. Подлинность —
// по заголовку X-Telegram-Bot-Api-Secret-Token (задаётся в setWebhook).
export function createTelegramWebhookRouter(): Router {
  const router = Router()
  router.post('/login-webhook', rateLimit({ limit: 600, windowMs: 60_000 }), async (req, res) => {
    const bot = getLoginBot()
    if (!bot || !bot.webhookSecret) {
      res.status(404).end()
      return
    }
    if (!secretMatches(req.header('X-Telegram-Bot-Api-Secret-Token'), bot.webhookSecret)) {
      res.status(401).end()
      return
    }
    try {
      await handleTelegramUpdate(bot, (req.body ?? {}) as TelegramUpdate)
    } catch (err) {
      console.error('telegram login: update упал', err)
    }
    // Всегда 200 — иначе Telegram повторяет тот же update.
    res.json({ ok: true })
  })
  return router
}
