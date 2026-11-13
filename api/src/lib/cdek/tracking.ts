import { AppDataSource } from '../../config/dataSource.js'
import { CdekShipment } from '../../entities/CdekShipment.js'
import { Order } from '../../entities/Order.js'
import { writeOrderStatusEvent } from '../notifications/outbox.js'
import { CdekError } from './client.js'
import { errCode, type CdekShipmentDeps } from './worker.js'

// Слежение за вручением посылки в СДЭК (химикоины: кэшбек начисляется, когда
// заказ получен). Опрос GET /v2/orders/{uuid}, тот же тик воркера, что и создание
// заказов; вебхуки СДЭК не используем.
//
// Коды сверены с официальной документацией 2026-11-13:
//  - список статусов: `entity.statuses[]` ответа GET /v2/orders/{uuid},
//    https://apidoc.cdek.ru/#tag/order/operation/get_2
//    (code, name, date_time, необязательные reason_code и deleted);
//  - коды статусов, Приложение 1:
//    https://apidoc.cdek.ru/#tag/common/Prilozheniya/Prilozhenie-1.-Statusy-zakazov
//  - дополнительные коды (reason_code), Приложение 2: «20» — частичная доставка.
// Порядок элементов в statuses документацией не определён — решаем по наличию
// финального статуса и date_time, а не по позиции в массиве.
export const CDEK_STATUS_DELIVERED = 'DELIVERED'
export const CDEK_STATUS_NOT_DELIVERED = 'NOT_DELIVERED'
// DELIVERED с этим reason_code — частичная вручённость, не полное вручение.
export const CDEK_REASON_PARTIAL_DELIVERY = '20'

export const CDEK_TRACK_INTERVAL_MS = 3 * 60 * 60 * 1000
export const CDEK_TRACK_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000
export const MAX_TRACKED_PER_TICK = 3

export const DELIVERY_PROBLEM_NOT_DELIVERED = 'cdek_not_delivered'
export const DELIVERY_PROBLEM_TIMEOUT = 'cdek_tracking_timeout'
export const DELIVERY_PROBLEM_PARTIAL = 'cdek_partial_delivery'

export type CdekTrackOutcome = 'delivered' | 'not_delivered' | 'partial' | 'in_transit'

interface ParsedStatus {
  code: string
  reasonCode: string | null
  at: number
}

// СДЭК отдаёт «2026-11-12T10:00:00+0000» — без двоеточия в смещении.
function parseTime(value: unknown): number {
  if (typeof value !== 'string') return 0
  const t = Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
  return Number.isNaN(t) ? 0 : t
}

function parseStatuses(statuses: unknown): ParsedStatus[] {
  if (!Array.isArray(statuses)) return []
  const result: ParsedStatus[] = []
  for (const raw of statuses) {
    if (!raw || typeof raw !== 'object') continue
    const s = raw as Record<string, unknown>
    if (typeof s.code !== 'string' || s.code === '' || s.deleted === true) continue
    result.push({
      code: s.code,
      reasonCode: typeof s.reason_code === 'string' ? s.reason_code : null,
      at: parseTime(s.date_time),
    })
  }
  return result
}

export function classifyCdekStatuses(statuses: unknown): {
  outcome: CdekTrackOutcome
  code: string | null
} {
  const items = parseStatuses(statuses)
  const finals = items.filter(
    (s) => s.code === CDEK_STATUS_DELIVERED || s.code === CDEK_STATUS_NOT_DELIVERED,
  )
  if (finals.length > 0) {
    // Оба финальных сразу — не должно быть; побеждает более поздний.
    const last = finals.reduce((a, b) => (b.at > a.at ? b : a))
    if (last.code === CDEK_STATUS_NOT_DELIVERED) {
      return { outcome: 'not_delivered', code: last.code }
    }
    const partial = last.reasonCode === CDEK_REASON_PARTIAL_DELIVERY
    return { outcome: partial ? 'partial' : 'delivered', code: last.code }
  }
  if (items.length === 0) return { outcome: 'in_transit', code: null }
  const latest = items.reduce((a, b) => (b.at > a.at ? b : a))
  return { outcome: 'in_transit', code: latest.code }
}

interface CdekTrackInfo {
  entity?: { statuses?: unknown }
}

const repo = () => AppDataSource.getRepository(CdekShipment)

// Заказ → «получен» одной транзакцией с отметкой отправления (кэшбек начисляется
// внутри writeOrderStatusEvent). Строку заказа перечитываем под блокировкой: пока
// шёл запрос к СДЭК, админ мог получить или отменить заказ.
async function deliverOrder(s: CdekShipment, now: Date, code: string | null): Promise<void> {
  await AppDataSource.transaction(async (em) => {
    const fresh = await em
      .getRepository(Order)
      .findOne({ where: { id: s.orderId }, lock: { mode: 'pessimistic_write' } })
    let trackingState: 'delivered' | 'stopped' = 'stopped'
    if (fresh?.status === 'delivered') {
      trackingState = 'delivered'
    } else if (fresh && (fresh.status === 'paid' || fresh.status === 'shipped')) {
      const previous = fresh.status
      fresh.status = 'delivered'
      fresh.statusHistory = [
        ...(fresh.statusHistory ?? []),
        { from: previous, to: 'delivered', at: now.toISOString(), by: 'cdek' },
      ]
      await writeOrderStatusEvent(em, fresh, previous)
      trackingState = 'delivered'
    }
    await em
      .getRepository(CdekShipment)
      .update(s.id, { trackingState, nextTrackAt: null, lastCdekStatus: code })
  })
}

async function flagProblem(
  s: CdekShipment,
  problem: string,
  trackingState: 'not_delivered' | 'stopped',
  code: string | null,
): Promise<void> {
  await AppDataSource.transaction(async (em) => {
    await em.update(Order, s.orderId, { deliveryProblem: problem })
    await em
      .getRepository(CdekShipment)
      .update(s.id, { trackingState, nextTrackAt: null, lastCdekStatus: code })
  })
}

async function trackShipment(
  s: CdekShipment,
  { cdek }: CdekShipmentDeps,
  now: Date,
): Promise<void> {
  const order = await AppDataSource.getRepository(Order).findOneBy({ id: s.orderId })
  const active = order && (order.status === 'paid' || order.status === 'shipped')
  if (!order || (!active && order.status !== 'delivered')) {
    // Отменён/не оплачен/удалён — следить не за чем, заказ не трогаем.
    await repo().update(s.id, { trackingState: 'stopped', nextTrackAt: null })
    return
  }
  const since = s.submittedAt ?? s.createdAt
  if (now.getTime() - since.getTime() > CDEK_TRACK_MAX_AGE_MS) {
    if (order.status === 'delivered') {
      // Админ уже отметил заказ полученным — проблемы нет, просто хватит опрашивать.
      await repo().update(s.id, { trackingState: 'stopped', nextTrackAt: null })
    } else {
      await flagProblem(s, DELIVERY_PROBLEM_TIMEOUT, 'stopped', s.lastCdekStatus)
    }
    return
  }
  if (!s.cdekUuid) {
    await repo().update(s.id, { trackingState: 'stopped', nextTrackAt: null })
    return
  }
  const info = await cdek.get<CdekTrackInfo>(`/orders/${s.cdekUuid}`)
  const { outcome, code } = classifyCdekStatuses(info?.entity?.statuses)
  switch (outcome) {
    case 'delivered':
      await deliverOrder(s, now, code)
      return
    case 'not_delivered':
      await flagProblem(s, DELIVERY_PROBLEM_NOT_DELIVERED, 'not_delivered', code)
      return
    case 'partial':
      await flagProblem(s, DELIVERY_PROBLEM_PARTIAL, 'stopped', code)
      return
    case 'in_transit':
      await repo().update(s.id, {
        lastCdekStatus: code ?? s.lastCdekStatus,
        nextTrackAt: new Date(now.getTime() + CDEK_TRACK_INTERVAL_MS),
      })
  }
}

// Возвращает число обработанных отправлений. Ошибка по одному отправлению (СДЭК
// 429/5xx, сеть, база) не меняет его состояние — только сдвигает следующий опрос.
export async function processDueTracking(deps: CdekShipmentDeps, now: Date): Promise<number> {
  const due = await repo()
    .createQueryBuilder('s')
    .where(`s.state = 'created'`)
    .andWhere(`s.tracking_state = 'tracking'`)
    .andWhere('s.next_track_at <= :now', { now })
    .orderBy('s.next_track_at', 'ASC')
    .addOrderBy('s.id', 'ASC')
    .limit(MAX_TRACKED_PER_TICK)
    .getMany()
  for (const s of due) {
    try {
      await trackShipment(s, deps, now)
    } catch (err) {
      // Только код (и HTTP-статус СДЭК), без текста ошибки: он может содержать
      // данные покупателя (как и в worker.ts).
      const http = err instanceof CdekError ? ` (HTTP ${err.status})` : ''
      console.warn(`cdek: слежение за заказом ${s.orderId} — ${errCode(err)}${http}, повтор позже`)
      await repo()
        .update(s.id, { nextTrackAt: new Date(now.getTime() + CDEK_TRACK_INTERVAL_MS) })
        .catch((rescheduleErr: unknown) => {
          console.warn(
            `cdek: слежение за заказом ${s.orderId} — не удалось перенести следующий опрос: ${errCode(rescheduleErr)}`,
          )
        })
    }
  }
  return due.length
}
