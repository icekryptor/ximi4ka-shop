import { getLoginBot, type PolledUpdate, type TelegramLoginBot } from './loginBot.js'
import { handleTelegramUpdate, type TelegramUpdate } from '../account/telegramLogin.js'

// Long polling покупательского бота (TELEGRAM_LOGIN_POLLING=1). С нашего VPS
// Telegram недоступен по IPv4 в обе стороны: вебхук Telegram доставить не
// может («Connection timed out» в getWebhookInfo), а исходящие запросы по
// IPv6 проходят. Поэтому api сам забирает update — входящие соединения от
// Telegram не нужны. Обработка та же, что у вебхука (handleTelegramUpdate).

type Handler = (bot: TelegramLoginBot, update: TelegramUpdate) => Promise<void>

const RETRY_MIN_MS = 2_000
const RETRY_MAX_MS = 60_000

// Один цикл: забрать пачку, обработать по порядку, вернуть следующий offset.
// Ошибка одного update не мешает остальным и не откатывает offset — иначе
// «битый» update крутился бы вечно (вебхук ведёт себя так же: всегда 200).
export async function pollOnce(
  bot: TelegramLoginBot,
  offset: number | undefined,
  handle: Handler = handleTelegramUpdate,
): Promise<number | undefined> {
  const updates: PolledUpdate[] = await bot.getUpdates(offset)
  let next = offset
  for (const u of updates) {
    try {
      await handle(bot, u as unknown as TelegramUpdate)
    } catch (err) {
      console.error(`telegram login (polling): update ${u.update_id} упал`, err)
    }
    next = u.update_id + 1
  }
  return next
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Возвращает true, если опрос запущен. Цикл живёт весь процесс; ошибки сети
// и 409 (второй экземпляр при выкатке, не снятый вебхук) — пауза с ростом до
// минуты, затем снова.
export function startLoginBotPolling(): boolean {
  const bot = getLoginBot()
  if (!bot?.polling) return false
  void (async () => {
    let offset: number | undefined
    let webhookCleared = false
    let delay = RETRY_MIN_MS
    for (;;) {
      try {
        if (!webhookCleared) {
          await bot.deleteWebhook()
          webhookCleared = true
        }
        offset = await pollOnce(bot, offset)
        delay = RETRY_MIN_MS
      } catch (err) {
        console.error(
          `telegram login (polling): ${(err as Error).message} — повтор через ${delay / 1000} с`,
        )
        // 409 — у бота снова появился вебхук (кто-то запустил telegram-set-webhook).
        if (/\b409\b/.test((err as Error).message)) webhookCleared = false
        await sleep(delay)
        delay = Math.min(delay * 2, RETRY_MAX_MS)
      }
    }
  })()
  return true
}
