import type { OrderEventKey } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { GoogleSheetsClient, SheetsConfigError } from '../google/sheets.js'
import { TelegramBot, TelegramConfigError } from '../telegram/bot.js'
import { sheetRow, telegramCard, telegramStatusLine } from './format.js'
import { CHANNELS } from './outbox.js'

// Доставка очереди order_notifications в Google Таблицу и Telegram. Тик —
// раз в 10 с, одна обработка за раз внутри процесса: api — один контейнер,
// поэтому блокировки строк не нужны. Доставка «хотя бы один раз»: если
// процесс упал между отправкой и отметкой, запись уйдёт повторно — строка
// таблицы перезапишется тем же, в чате будет дубль. Это лучше потери.

export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000]
export const GIVE_UP_AFTER_MS = 24 * 60 * 60_000
export const WORKER_INTERVAL_MS = 10_000
const BATCH_SIZE = 20

export function nextDelayMs(attempts: number): number {
  return RETRY_DELAYS_MS[Math.min(Math.max(attempts, 1), RETRY_DELAYS_MS.length) - 1]
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

async function deliver(
  row: OrderNotification,
  order: Order,
  channels: NotificationChannels,
): Promise<void> {
  if (row.channel === 'sheets') {
    await channels.sheets!.upsertOrderRow(order.orderNumber, sheetRow(order))
    return
  }
  const bot = channels.telegram!
  if (row.eventKey === 'created') {
    const messageId = await bot.sendMessage(telegramCard(order))
    await AppDataSource.getRepository(Order).update(order.id, { telegramMessageId: messageId })
    return
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
}

export async function processDueNotifications(
  channels: NotificationChannels,
  { now = new Date() }: { now?: Date } = {},
): Promise<{ sent: number; retried: number; failed: number }> {
  const result = { sent: 0, retried: 0, failed: 0 }
  const enabled = CHANNELS.filter((c) => channels[c] !== null)
  if (enabled.length === 0) return result

  const repo = AppDataSource.getRepository(OrderNotification)
  const due = await repo
    .createQueryBuilder('n')
    .where('n.sent_at IS NULL AND n.failed_at IS NULL')
    .andWhere('n.next_attempt_at <= :now', { now })
    .andWhere('n.channel IN (:...enabled)', { enabled })
    .orderBy('n.created_at', 'ASC')
    .addOrderBy('n.id', 'ASC')
    .limit(BATCH_SIZE)
    .getMany()

  for (const row of due) {
    // Порядок внутри «заказ × канал»: пока более ранняя запись не доставлена
    // и не сдалась, эта ждёт — смена статуса не обгонит карточку.
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

    const attempts = row.attempts + 1
    try {
      const order = await AppDataSource.getRepository(Order).findOne({
        where: { id: row.orderId },
        relations: { items: true },
      })
      if (!order) throw new SheetsConfigError('Заказ удалён')
      await deliver(row, order, channels)
      await repo.update(row.id, { sentAt: now, attempts, lastError: null })
      result.sent += 1
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 2000)
      const expired = now.getTime() - row.createdAt.getTime() >= GIVE_UP_AFTER_MS
      if (isConfigError(err) || expired) {
        await repo.update(row.id, { attempts, lastError: message, failedAt: now })
        result.failed += 1
      } else {
        await repo.update(row.id, {
          attempts,
          lastError: message,
          nextAttemptAt: new Date(now.getTime() + nextDelayMs(attempts)),
        })
        result.retried += 1
      }
      console.error(
        `notifications: ${row.channel}/${row.eventKey} заказа ${row.orderId} — ${message}`,
      )
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
