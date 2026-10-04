import { getLoginBot, type PolledUpdate, type TelegramLoginBot } from './loginBot.js'
import { handleTelegramUpdate, type TelegramUpdate } from '../account/telegramLogin.js'

// Long polling покупательского бота (TELEGRAM_LOGIN_POLLING=1). С нашего VPS
// Telegram недоступен по IPv4 в обе стороны: вебхук Telegram доставить не
// может («Connection timed out» в getWebhookInfo), а исходящие запросы по
// IPv6 проходят. Поэтому api сам забирает update — входящие соединения от
// Telegram не нужны. Обработка та же, что у вебхука (handleTelegramUpdate).

type Handler = (bot: TelegramLoginBot, update: TelegramUpdate) => Promise<void>

// Коротко: человек ждёт ответа бота на экране входа, а сбои у нас —
// разовые обрывы соединения, не долгие простои Telegram.
const RETRY_MIN_MS = 1_000
const RETRY_MAX_MS = 5_000

// Один цикл: забрать пачку, обработать по порядку, вернуть следующий offset.
// Ошибка одного update не мешает остальным и не откатывает offset — иначе
// «битый» update крутился бы вечно (вебхук ведёт себя так же: всегда 200).
export async function pollOnce(
  bot: TelegramLoginBot,
  offset: number | undefined,
  handle: Handler = handleTelegramUpdate,
  onFetched: () => void = markPollerOk,
): Promise<number | undefined> {
  const updates: PolledUpdate[] = await bot.getUpdates(offset)
  // «Telegram достижим» — это ответ getUpdates, а не конец обработки пачки:
  // обработчики сами ходят в Telegram (до ~40 с на update при сбоях), и долгая
  // пачка не должна выглядеть как потеря связи.
  onFetched()
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

// Здоровье опроса. Docker-healthcheck проверяет только /health, и бот
// 3,5 дня молчал при статусе «healthy» (29.09–03.10.2026: контейнер без пути
// до Telegram). Здесь помним последний удачный getUpdates: по нему
// /health/telegram отдаёт 503, а /api/account/auth/config прячет кнопку
// Telegram — человек выбирает почту, а не висит на «ждём подтверждения».
// Состояние на процесс: считаем, что на токен приходится один опрос (второй
// экземпляр с тем же токеном получал бы 409 и всё равно не принимал update).
const STALE_AFTER_MS = 90_000

const health: { running: boolean; startedAt: number; lastOkAt: number | null } = {
  running: false,
  startedAt: 0,
  lastOkAt: null,
}

export function markPollerStarted(now = Date.now()): void {
  health.running = true
  health.startedAt = now
  health.lastOkAt = null
}

export function markPollerOk(now = Date.now()): void {
  health.lastOkAt = now
}

export function resetLoginPollerHealth(): void {
  health.running = false
  health.startedAt = 0
  health.lastOkAt = null
}

// Без запущенного опроса (вебхук, бот не настроен) оценивать нечего — здоров.
export function getLoginPollerHealth(now = Date.now()): {
  running: boolean
  healthy: boolean
  lastOkAt: number | null
} {
  if (!health.running) return { running: false, healthy: true, lastOkAt: null }
  const since = health.lastOkAt ?? health.startedAt
  return { running: true, healthy: now - since < STALE_AFTER_MS, lastOkAt: health.lastOkAt }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Возвращает true, если опрос запущен. Цикл живёт весь процесс; ошибки сети
// и 409 (второй экземпляр при выкатке, не снятый вебхук) — пауза с ростом до
// 5 с, затем снова.
export function startLoginBotPolling(): boolean {
  const bot = getLoginBot()
  if (!bot?.polling) return false
  markPollerStarted()
  void (async () => {
    let offset: number | undefined
    let webhookCleared = false
    let delay = RETRY_MIN_MS
    let staleLogged = false
    for (;;) {
      try {
        if (!webhookCleared) {
          await bot.deleteWebhook()
          webhookCleared = true
        }
        offset = await pollOnce(bot, offset)
        if (staleLogged) {
          console.error('telegram login (polling): связь с Telegram восстановлена')
          staleLogged = false
        }
        delay = RETRY_MIN_MS
      } catch (err) {
        console.error(
          `telegram login (polling): ${(err as Error).message} — повтор через ${delay / 1000} с`,
        )
        // 409 — у бота снова появился вебхук (кто-то запустил telegram-set-webhook).
        if (/\b409\b/.test((err as Error).message)) webhookCleared = false
        // Один раз при переходе в «нездоров» — отдельной строкой для поиска по логу.
        const h = getLoginPollerHealth()
        if (!h.healthy && !staleLogged) {
          staleLogged = true
          console.error(
            'telegram login (polling): НЕТ СВЯЗИ с Telegram больше 90 с, бот входа не отвечает',
          )
        }
        await sleep(delay)
        delay = Math.min(delay * 2, RETRY_MAX_MS)
      }
    }
  })()
  return true
}
