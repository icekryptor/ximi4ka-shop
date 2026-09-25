import type { NotificationChannel, OrderEventKey } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { GoogleSheetsClient, SheetsConfigError } from '../google/sheets.js'
import { TelegramBot, TelegramConfigError } from '../telegram/bot.js'
import { sheetRow, telegramCard, telegramStatusLine } from './format.js'
import { CHANNELS } from './outbox.js'
import { RateLimitError } from './rateLimit.js'

// Доставка очереди order_notifications в Google Таблицу и Telegram. Тик —
// раз в 10 с, одна обработка за раз внутри процесса: api — один контейнер,
// поэтому блокировки строк не нужны. Доставка «хотя бы один раз»: если
// процесс упал между отправкой и отметкой, запись уйдёт повторно — строка
// таблицы перезапишется тем же, в чате будет дубль. Это лучше потери.

export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000]
export const GIVE_UP_AFTER_MS = 24 * 60 * 60_000
export const WORKER_INTERVAL_MS = 10_000
// Сколько записей канала выбираем за тик. Выборка — отдельно по каждому
// каналу, поэтому хвост одного канала не занимает место другого; запас над
// лимитом доставок — на записи, пропущенные внутри тика из-за порядка.
const BATCH_SIZE = 20
// Не больше стольких доставок на канал за тик (тик — 10 с). Telegram пускает
// в группу около 20 сообщений в минуту — 3 за тик дают 18. Остальное ждёт
// следующего тика: так накопленная очередь уходит постепенно, без 429.
export const MAX_DELIVERIES_PER_TICK: Record<NotificationChannel, number> = {
  sheets: 10,
  telegram: 3,
}
// Пауза после 429 не короче этой, даже если сервис просит меньше.
export const MIN_RATE_LIMIT_PAUSE_MS = 30_000
const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  sheets: 'Google Таблицы',
  telegram: 'Telegram',
}

export function nextDelayMs(attempts: number): number {
  return RETRY_DELAYS_MS[Math.min(Math.max(attempts, 1), RETRY_DELAYS_MS.length) - 1]
}

// Суммарная запланированная пауза после `attempts` неудач. Сдаёмся, когда
// она доходит до GIVE_UP_AFTER_MS: сутки считаются по времени повторов, а
// не по возрасту записи — иначе заказ, пролежавший в очереди до появления
// ключей больше суток, сдавался бы на первой же временной ошибке. Ручной
// повтор в админке сбрасывает attempts и даёт новое окно.
export function retryWindowMs(attempts: number): number {
  let total = 0
  for (let i = 1; i <= attempts; i += 1) total += nextDelayMs(i)
  return total
}

export interface NotificationChannels {
  sheets: Pick<GoogleSheetsClient, 'upsertOrderRow'> | null
  telegram: Pick<TelegramBot, 'sendMessage'> | null
}

// Битый ключ Google не должен ронять api: канал выключается, причина — в лог.
export function channelsFromEnv(env: NodeJS.ProcessEnv = process.env): NotificationChannels {
  let sheets: NotificationChannels['sheets'] = null
  try {
    sheets = GoogleSheetsClient.fromEnv(env)
  } catch (err) {
    console.error(`notifications: Google Таблица выключена — ${(err as Error).message}`)
  }
  return { sheets, telegram: TelegramBot.fromEnv(env) }
}

function isConfigError(err: unknown): boolean {
  return err instanceof SheetsConfigError || err instanceof TelegramConfigError
}

// Только внешний вызов — запись в БД делает вызывающий код одной транзакцией
// с отметкой доставки (см. processRow).
async function deliver(
  row: OrderNotification,
  order: Order,
  channels: NotificationChannels,
): Promise<{ telegramMessageId?: number }> {
  if (row.channel === 'sheets') {
    await channels.sheets!.upsertOrderRow(order.orderNumber, sheetRow(order))
    return {}
  }
  const bot = channels.telegram!
  if (row.eventKey === 'created') {
    const telegramMessageId = await bot.sendMessage(telegramCard(order))
    return { telegramMessageId }
  }
  const replyTo = order.telegramMessageId
  await bot.sendMessage(
    telegramStatusLine(
      order.orderNumber,
      row.eventKey as Exclude<OrderEventKey, 'created'>,
      replyTo == null,
    ),
    replyTo,
  )
  return {}
}

type RowOutcome = 'sent' | 'retried' | 'failed' | 'rateLimited'

function dueRows(channel: NotificationChannel, now: Date): Promise<OrderNotification[]> {
  return (
    AppDataSource.getRepository(OrderNotification)
      .createQueryBuilder('n')
      .where('n.sent_at IS NULL AND n.failed_at IS NULL')
      .andWhere('n.next_attempt_at <= :now', { now })
      .andWhere('n.channel = :channel', { channel })
      // Порядок внутри «заказ × канал»: пока более ранняя запись не доставлена
      // и не сдалась, эта ждёт — смена статуса не обгонит карточку. Считаем
      // «блокирующей» только запись, которая САМА не готова к повтору прямо
      // сейчас (next_attempt_at в будущем — она в бэкоффе): иначе перманентно
      // заблокированная строка статуса вечно остаётся «due» по времени и на
      // каждом тике съедала бы место в партии, не продвигаясь — так вымирала
      // вся очередь (найдено ревью). Если же блокирующая запись готова к
      // повтору в этом же тике, обе попадают в партию, а порядок внутри цикла
      // ниже гарантирует, что статус не уйдёт раньше карточки.
      .andWhere(
        `NOT EXISTS (
        SELECT 1 FROM order_notifications p
        WHERE p.order_id = n.order_id
          AND p.channel = n.channel
          AND p.sent_at IS NULL
          AND p.failed_at IS NULL
          AND p.created_at < n.created_at
          AND p.next_attempt_at > :now
      )`,
        { now },
      )
      .orderBy('n.created_at', 'ASC')
      .addOrderBy('n.id', 'ASC')
      .limit(BATCH_SIZE)
      .getMany()
  )
}

async function processRow(
  row: OrderNotification,
  channels: NotificationChannels,
  now: Date,
): Promise<RowOutcome> {
  const repo = AppDataSource.getRepository(OrderNotification)
  const attempts = row.attempts + 1
  try {
    const order = await AppDataSource.getRepository(Order).findOne({
      where: { id: row.orderId },
      relations: { items: true },
    })
    if (!order) throw new SheetsConfigError('Заказ удалён')
    const delivery = await deliver(row, order, channels)
    // Id карточки в чате и отметка «доставлено» — одной транзакцией: узкое
    // окно дубля карточки при падении процесса между двумя отдельными
    // записями (найдено ревью).
    await AppDataSource.transaction(async (em) => {
      if (delivery.telegramMessageId !== undefined) {
        await em
          .getRepository(Order)
          .update(order.id, { telegramMessageId: delivery.telegramMessageId })
      }
      await em.getRepository(OrderNotification).update(row.id, {
        sentAt: now,
        attempts,
        lastError: null,
      })
    })
    return 'sent'
  } catch (err) {
    if (err instanceof RateLimitError) {
      // Сервис просит подождать — это не неудачная попытка: attempts не
      // растёт, окно сдачи не тратится.
      const pauseMs = Math.max(err.retryAfterMs, MIN_RATE_LIMIT_PAUSE_MS)
      const lastError = `лимит ${CHANNEL_LABELS[row.channel]}, повтор через ${Math.round(pauseMs / 1000)} с`
      await repo.update(row.id, {
        lastError,
        nextAttemptAt: new Date(now.getTime() + pauseMs),
      })
      console.warn(
        `notifications: ${row.channel}/${row.eventKey} заказа ${row.orderId} — ${lastError} (${err.message})`,
      )
      return 'rateLimited'
    }
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 2000)
    const outcome: RowOutcome =
      isConfigError(err) || retryWindowMs(attempts) >= GIVE_UP_AFTER_MS ? 'failed' : 'retried'
    if (outcome === 'failed') {
      await repo.update(row.id, { attempts, lastError: message, failedAt: now })
    } else {
      await repo.update(row.id, {
        attempts,
        lastError: message,
        nextAttemptAt: new Date(now.getTime() + nextDelayMs(attempts)),
      })
    }
    console.error(
      `notifications: ${row.channel}/${row.eventKey} заказа ${row.orderId} — ${message}`,
    )
    return outcome
  }
}

export async function processDueNotifications(
  channels: NotificationChannels,
  { now = new Date() }: { now?: Date } = {},
): Promise<{ sent: number; retried: number; failed: number }> {
  const result = { sent: 0, retried: 0, failed: 0 }
  const repo = AppDataSource.getRepository(OrderNotification)

  for (const channel of CHANNELS) {
    if (channels[channel] === null) continue
    let deliveries = 0
    for (const row of await dueRows(channel, now)) {
      // Остальное — в следующем тике: записи остаются готовыми к отправке.
      if (deliveries >= MAX_DELIVERIES_PER_TICK[channel]) break
      // Догоняющая проверка для строк, попавших в партию вместе: если
      // блокирующая запись входит в эту же партию и обрабатывается раньше
      // (сортировка по created_at), к этому моменту она уже либо отправлена
      // (не блокирует), либо ушла в повтор/сдалась в БД — перечитываем.
      const blocked = await repo
        .createQueryBuilder('p')
        .where('p.order_id = :orderId AND p.channel = :channel', {
          orderId: row.orderId,
          channel: row.channel,
        })
        .andWhere('p.sent_at IS NULL AND p.failed_at IS NULL')
        .andWhere('p.created_at < :createdAt', { createdAt: row.createdAt })
        .getExists()
      if (blocked) continue

      deliveries += 1
      const outcome = await processRow(row, channels, now)
      // Упёрлись в лимит сервиса — до конца тика канал не трогаем.
      if (outcome === 'rateLimited') {
        result.retried += 1
        break
      }
      result[outcome] += 1
    }
  }
  return result
}

// Запускается из api/src/index.ts. null — ни один канал не настроен.
export function startNotificationWorker(
  channels: NotificationChannels = channelsFromEnv(),
  intervalMs: number = WORKER_INTERVAL_MS,
): NodeJS.Timeout | null {
  if (!channels.sheets && !channels.telegram) return null
  let running = false
  const timer = setInterval(() => {
    if (running) return
    running = true
    processDueNotifications(channels)
      .catch((err) => console.error('notifications: тик обработчика упал', err))
      .finally(() => {
        running = false
      })
  }, intervalMs)
  timer.unref()
  return timer
}
