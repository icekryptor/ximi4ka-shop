import { AppDataSource } from '../../config/dataSource.js'
import { CdekShipment } from '../../entities/CdekShipment.js'
import { Order } from '../../entities/Order.js'
import {
  GIVE_UP_AFTER_MS,
  MIN_RATE_LIMIT_PAUSE_MS,
  nextDelayMs,
  retryWindowMs,
} from '../notifications/worker.js'
import { CdekClient, CdekError, PROD_BASE_URL, TEST_BASE_URL } from './client.js'
import { getCdekClient } from './index.js'
import { loadShipmentInput } from './orderInput.js'
import {
  buildCdekOrder,
  CdekDataError,
  cdekOrderConfigFromEnv,
  cdekOrdersEnabled,
  type CdekOrderConfig,
} from './orders.js'

// Создание заказа в СДЭК после оплаты
// (docs/superpowers/specs/2026-09-25-cdek-auto-orders-design.md §5, §7).
// queued → POST /v2/orders → registering → опрос GET /v2/orders/{uuid} →
// created | failed. Тик — раз в 10 с, одна обработка за раз внутри процесса:
// api — один контейнер, как у уведомлений, блокировки строк не нужны. От
// дублей защищает наш номер в `number` и поиск по нему перед КАЖДЫМ POST —
// не только повторным: счётчик attempts сбрасывается ручным повтором в
// админке, а рестарт процесса сразу после первого POST оставляет запись
// с attempts=0 и без uuid, хотя заказ мог уже уйти в СДЭК.

export const CDEK_WORKER_INTERVAL_MS = 10_000
export const CDEK_POLL_INTERVAL_MS = 15_000
// Дольше этого в ACCEPTED/WAITING — считаем временной ошибкой и опрашиваем
// по общему расписанию пауз (песочница 25.09 держала заказы больше 3 минут).
export const CDEK_REGISTER_TIMEOUT_MS = 30 * 60_000
export const MAX_SHIPMENTS_PER_TICK = 3

type CdekApi = Pick<CdekClient, 'get' | 'post'>

export interface CdekShipmentDeps {
  cdek: CdekApi
  config: CdekOrderConfig
}

interface CdekRequestState {
  type?: string
  state?: string
  errors?: { code?: string; message?: string }[]
}

interface CdekOrderInfo {
  entity?: { uuid?: string; cdek_number?: string | null }
  requests?: CdekRequestState[]
}

type Outcome = 'submitted' | 'created' | 'waiting' | 'retried' | 'failed'

const PAID_STATUSES = new Set(['paid', 'shipped'])

function createRequest(info: CdekOrderInfo | null): CdekRequestState | undefined {
  return info?.requests?.find((r) => r.type === 'CREATE')
}

function errorsText(request: CdekRequestState | undefined): string {
  const text = (request?.errors ?? [])
    .map((e) => e.message ?? e.code)
    .filter(Boolean)
    .join('; ')
  return text || 'СДЭК отклонил заказ без описания'
}

// Повтор тех же данных не поможет: СДЭК отверг заказ по существу.
function isPermanent(err: unknown): boolean {
  return err instanceof CdekDataError
}

// СДЭК отверг тело заказа по существу (design §7: «4xx с errors[] на POST»).
// Распознаём только это: код ошибки СДЭК есть и это не голый HTTP-статус
// (`http_error` — сервер ответил 4xx без опознанного тела, например прокси
// или неверный CDEK_API_URL) и не отказ в токене (`auth_failed` — ключи
// временно не работают, не данные заказа); 401/403/408/429 — тоже временные.
// Поиск по номеру и опрос статуса такие коды не проходят через эту функцию:
// там 4xx значит «не знаем» или «ещё не готово», а не «данные заказа неверны».
function asDataError(err: unknown): CdekDataError | null {
  if (!(err instanceof CdekError)) return null
  if (err.status < 400 || err.status >= 500) return null
  if ([401, 403, 408, 429].includes(err.status)) return null
  if (err.code === 'http_error' || err.code === 'auth_failed') return null
  const items = Array.isArray(err.details)
    ? (err.details as { code?: string; message?: string }[])
    : []
  const text = items
    .map((e) => e.message ?? e.code)
    .filter(Boolean)
    .join('; ')
  return new CdekDataError(text || err.message)
}

// Код ошибки в лог сервера — без текста СДЭК: он может содержать эхо данных
// покупателя (design §9 — полный текст виден только в админке, в last_error).
function errCode(err: unknown): string {
  if (err instanceof CdekError) return err.code
  if (err instanceof Error) return err.name
  return 'unknown_error'
}

// Заказ, который СДЭК уже знает под нашим номером. «Не найдено» — не ошибка.
async function findByNumber(cdek: CdekApi, orderNumber: string): Promise<CdekOrderInfo | null> {
  try {
    return await cdek.get<CdekOrderInfo>('/orders', { im_number: orderNumber })
  } catch (err) {
    if (err instanceof CdekError && err.code === 'v2_entity_not_found_im_number') return null
    throw err
  }
}

async function submit(
  s: CdekShipment,
  order: Order,
  { cdek, config }: CdekShipmentDeps,
  now: Date,
): Promise<Outcome> {
  const repo = AppDataSource.getRepository(CdekShipment)
  if (!PAID_STATUSES.has(order.status)) {
    const message =
      order.status === 'cancelled'
        ? 'Заказ отменён — в СДЭК не отправляем'
        : `Заказ не оплачен (статус ${order.status}) — в СДЭК не отправляем`
    throw new CdekDataError(message)
  }
  // Перед каждым POST проверяем, не знает ли СДЭК заказ уже под нашим
  // номером — прошлая попытка могла дойти, а ответ потеряться.
  const known = await findByNumber(cdek, order.orderNumber)
  const knownUuid = known?.entity?.uuid
  if (knownUuid && createRequest(known)?.state !== 'INVALID') {
    await repo.update(s.id, {
      state: 'registering',
      cdekUuid: knownUuid,
      submittedAt: s.submittedAt ?? now,
      nextAttemptAt: now,
      lastError: null,
    })
    return 'submitted'
  }
  const { packages, lines } = await loadShipmentInput(order)
  let res: CdekOrderInfo
  try {
    res = await cdek.post<CdekOrderInfo>('/orders', buildCdekOrder(order, packages, lines, config))
  } catch (err) {
    throw asDataError(err) ?? err
  }
  const uuid = res?.entity?.uuid
  if (!uuid) throw new CdekError(0, 'no_uuid', 'СДЭК принял заказ, но не вернул его uuid')
  await repo.update(s.id, {
    state: 'registering',
    cdekUuid: uuid,
    submittedAt: now,
    nextAttemptAt: new Date(now.getTime() + CDEK_POLL_INTERVAL_MS),
    lastError: null,
  })
  return 'submitted'
}

async function poll(s: CdekShipment, { cdek }: CdekShipmentDeps, now: Date): Promise<Outcome> {
  const repo = AppDataSource.getRepository(CdekShipment)
  if (!s.cdekUuid) {
    // Не должно случаться: без uuid опрашивать нечего — отправляем заново.
    await repo.update(s.id, { state: 'queued', nextAttemptAt: now })
    return 'retried'
  }
  const info = await cdek.get<CdekOrderInfo>(`/orders/${s.cdekUuid}`)
  const request = createRequest(info)
  if (request?.state === 'INVALID') throw new CdekDataError(errorsText(request))
  const cdekNumber = info?.entity?.cdek_number
  if (request?.state === 'SUCCESSFUL' && cdekNumber) {
    await repo.update(s.id, { state: 'created', cdekNumber, lastError: null })
    return 'created'
  }
  const since = s.submittedAt ?? s.updatedAt
  if (now.getTime() - since.getTime() > CDEK_REGISTER_TIMEOUT_MS) {
    throw new CdekError(
      0,
      'register_timeout',
      `СДЭК ещё не подтвердил заказ (${request?.state ?? 'нет ответа'})`,
    )
  }
  await repo.update(s.id, { nextAttemptAt: new Date(now.getTime() + CDEK_POLL_INTERVAL_MS) })
  return 'waiting'
}

async function processShipment(
  s: CdekShipment,
  deps: CdekShipmentDeps,
  now: Date,
): Promise<Outcome> {
  const repo = AppDataSource.getRepository(CdekShipment)
  try {
    const order = await AppDataSource.getRepository(Order).findOne({
      where: { id: s.orderId },
      relations: { items: true },
    })
    if (!order) throw new CdekDataError('Заказ удалён')
    return s.state === 'queued' ? await submit(s, order, deps, now) : await poll(s, deps, now)
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 2000)
    if (err instanceof CdekError && err.status === 429) {
      // Лимит СДЭК — не неудачная попытка: окно повторов не тратится.
      await repo.update(s.id, {
        lastError: `лимит СДЭК, повтор через ${MIN_RATE_LIMIT_PAUSE_MS / 1000} с`,
        nextAttemptAt: new Date(now.getTime() + MIN_RATE_LIMIT_PAUSE_MS),
      })
      return 'retried'
    }
    const attempts = s.attempts + 1
    if (isPermanent(err) || retryWindowMs(attempts) >= GIVE_UP_AFTER_MS) {
      await repo.update(s.id, { state: 'failed', attempts, lastError: message })
      console.error(`cdek: заказ ${s.orderId} не создан в СДЭК — ${errCode(err)}`)
      return 'failed'
    }
    await repo.update(s.id, {
      attempts,
      lastError: message,
      nextAttemptAt: new Date(now.getTime() + nextDelayMs(attempts)),
    })
    console.warn(`cdek: заказ ${s.orderId} — ${errCode(err)}, повтор по расписанию`)
    return 'retried'
  }
}

export async function processDueShipments(
  deps: CdekShipmentDeps,
  { now = new Date() }: { now?: Date } = {},
): Promise<Record<Outcome, number>> {
  const due = await AppDataSource.getRepository(CdekShipment)
    .createQueryBuilder('s')
    .where(`s.state IN ('queued', 'registering')`)
    .andWhere('s.next_attempt_at <= :now', { now })
    .orderBy('s.next_attempt_at', 'ASC')
    .addOrderBy('s.id', 'ASC')
    .limit(MAX_SHIPMENTS_PER_TICK)
    .getMany()
  const result: Record<Outcome, number> = {
    submitted: 0,
    created: 0,
    waiting: 0,
    retried: 0,
    failed: 0,
  }
  for (const s of due) result[await processShipment(s, deps, now)] += 1
  return result
}

// Запускается из api/src/index.ts. null — создание заказов в СДЭК выключено
// или не настроено; причина — в лог.
export function startCdekShipmentWorker({
  env = process.env,
  cdek,
  intervalMs = CDEK_WORKER_INTERVAL_MS,
}: { env?: NodeJS.ProcessEnv; cdek?: CdekApi; intervalMs?: number } = {}): NodeJS.Timeout | null {
  if (!cdekOrdersEnabled(env)) return null
  let config: CdekOrderConfig
  let baseUrl: string
  try {
    config = cdekOrderConfigFromEnv(env)
    baseUrl = CdekClient.fromEnv(env).baseUrl
  } catch (err) {
    // Нет реквизитов (CdekConfigError) или боевая среда без ключей — не
    // стартуем; записи в очереди ждут, пока настройку не поправят.
    console.error(`cdek: создание заказов выключено — ${(err as Error).message}`)
    return null
  }
  // В api/.env лежат боевые ключи: обычный npm run dev не должен заводить
  // настоящие заказы.
  if (env.NODE_ENV !== 'production' && baseUrl === PROD_BASE_URL) {
    console.error(
      `cdek: вне production заказы в боевом СДЭК не создаём — задайте CDEK_API_URL=${TEST_BASE_URL}`,
    )
    return null
  }
  const deps: CdekShipmentDeps = { cdek: cdek ?? getCdekClient(), config }
  let running = false
  const timer = setInterval(() => {
    if (running) return
    running = true
    processDueShipments(deps)
      .catch((err) => console.error('cdek: тик обработчика упал', err))
      .finally(() => {
        running = false
      })
  }, intervalMs)
  timer.unref()
  return timer
}
