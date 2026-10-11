import type { EntityManager } from 'typeorm'
import { MetrikaConversion } from '../../entities/MetrikaConversion.js'
import type { Order } from '../../entities/Order.js'

const DAY_MS = 24 * 60 * 60 * 1000

// Метрика дополняет визиты офлайн-данными только в пределах 21 дня.
export const MAX_CLICK_AGE_MS = 21 * DAY_MS

export const DEFAULT_TARGET = 'order_paid'
// Длина колонки target; более длинная цель из env не должна ронять оплату.
const MAX_TARGET_LENGTH = 64

// Настоящий yclid состоит из цифр. Всё остальное (мусор, подделка, кавычки)
// в файл для Метрики не пускаем: из-за одной кривой строки она может отклонить
// весь пакет.
const YCLID_RE = /^\d{1,32}$/

export function metrikaOfflineEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.METRIKA_OFFLINE_ENABLED === 'true'
}

// yclid рекламного клика, по которому заказ можно связать с визитом: сначала
// последнее рекламное касание, затем первое. Клик старше 21 дня к моменту
// оплаты не берём: Метрика такой визит уже не свяжет.
export function pickYclid(order: Pick<Order, 'attribution' | 'paidAt'>): string | null {
  if (!order.paidAt) return null
  const paid = order.paidAt.getTime()
  for (const touch of [order.attribution?.last, order.attribution?.first]) {
    if (!touch?.yclid || !YCLID_RE.test(touch.yclid)) continue
    const at = Date.parse(touch.at)
    if (Number.isFinite(at) && paid - at <= MAX_CLICK_AGE_MS) return touch.yclid
  }
  return null
}

// Ставит оплаченный заказ в очередь офлайн-конверсий. Вызывать в транзакции,
// которая переводит заказ в paid. При выключенном флаге или без yclid — ничего:
// иначе включение флага отправило бы в Метрику старые заказы. Повтор — no-op
// (уникальный индекс + ON CONFLICT DO NOTHING). Сбой самой вставки перехватываем
// во вложенной транзакции (savepoint): подтверждение оплаты не должно зависеть от
// маркетинговой выгрузки.
export async function enqueueMetrikaConversion(
  em: EntityManager,
  order: Pick<Order, 'id' | 'attribution' | 'paidAt' | 'totalRub'>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!metrikaOfflineEnabled(env)) return
  const yclid = pickYclid(order)
  const eventAt = order.paidAt
  if (!yclid || !eventAt) return
  const target = (env.METRIKA_OFFLINE_TARGET?.trim() || DEFAULT_TARGET).slice(0, MAX_TARGET_LENGTH)
  try {
    await em.transaction(async (savepoint) => {
      await savepoint
        .createQueryBuilder()
        .insert()
        .into(MetrikaConversion)
        .values({
          orderId: order.id,
          yclid,
          target,
          priceRub: order.totalRub,
          eventAt,
        })
        .orIgnore()
        .execute()
    })
  } catch (err) {
    console.error(
      'metrika: не удалось поставить конверсию в очередь:',
      err instanceof Error ? err.message : err,
    )
  }
}
