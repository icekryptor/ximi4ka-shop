// Регистрирует webhook покупательского бота. Локально:
//   npm run telegram:set-webhook -w api -- https://new.ximi4ka.ru
// В контейнере:
//   docker compose exec ximishop-api node api/dist/scripts/telegram-set-webhook.js
// Адрес по умолчанию — WEB_ORIGIN (Caddy отдаёт /api/* в api).
import 'dotenv/config'
import { getLoginBot } from '../lib/telegram/loginBot.js'

async function main() {
  const bot = getLoginBot()
  if (!bot) throw new Error('TELEGRAM_LOGIN_BOT_TOKEN / TELEGRAM_LOGIN_BOT_USERNAME не заданы')
  if (!bot.webhookSecret) throw new Error('TELEGRAM_LOGIN_WEBHOOK_SECRET не задан')
  const origin = (process.argv[2] ?? process.env.WEB_ORIGIN ?? '').replace(/\/$/, '')
  if (!origin.startsWith('https://'))
    throw new Error(`нужен https-адрес сайта, получено: "${origin}"`)
  const url = `${origin}/api/telegram/login-webhook`
  await bot.setWebhook(url, bot.webhookSecret)
  console.log(`webhook @${bot.username} → ${url}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
