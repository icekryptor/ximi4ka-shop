import { In, LessThanOrEqual } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import { MetrikaConversion } from '../../entities/MetrikaConversion.js'
import { getSettings } from '../settings.js'
import { RateLimitError } from '../notifications/rateLimit.js'
import { MetrikaClient, MetrikaError, type ConversionRow } from './client.js'
import { metrikaOfflineEnabled } from './queue.js'

const MIN_MS = 60 * 1000
const HOUR_MS = 60 * MIN_MS

// Паузы между неудачными попытками; после последней остаётся шестичасовая.
const RETRY_DELAYS_MS = [MIN_MS, 5 * MIN_MS, 15 * MIN_MS, HOUR_MS, 6 * HOUR_MS]
// Через сутки с постановки в очередь запись сдаётся: конверсия за 21 день
// после клика ещё нужна, но дольше сутки долбить недоступную Метрику незачем.
const GIVE_UP_AFTER_MS = 24 * HOUR_MS

// Записей в одном файле. Остальные уйдут следующим тиком.
const BATCH_SIZE = 200

// Захваченная запись, по которой за это время не пришло ни успеха, ни ошибки,
// считается «исход неизвестен» и не отправляется повторно.
const STALE_CLAIM_MS = 15 * MIN_MS

const UNKNOWN_OUTCOME =
  'исход загрузки неизвестен (таймаут, обрыв или перезапуск во время отправки): ' +
  'сверьте отчёт «Офлайн-конверсии» в Метрике, при необходимости верните запись в очередь вручную'

export interface ProcessResult {
  sent: number
  retried: number
  failed: number
  /** Записи, чей исход неизвестен: остаются в sending до сдачи. */
  unknown: number
}

function retryDelayMs(attempts: number): number {
  return RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]
}

// Коды сетевых ошибок, при которых запрос точно не дошёл до Метрики.
const NOT_SENT_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
])

function causeCode(err: unknown): string | null {
  const cause = (err as { cause?: { code?: unknown } } | null)?.cause
  return typeof cause?.code === 'string' ? cause.code : null
}

// Файл точно не принят: Метрика ответила ошибкой или запрос не дошёл до неё.
// Всё остальное (таймаут, обрыв, 2xx без данных) — неизвестно: возможно, файл
// уже принят, и повтор дал бы дубль конверсии.
function isDefinitelyNotAccepted(err: unknown): boolean {
  if (err instanceof MetrikaError) return err.status >= 400
  const code = causeCode(err)
  return code !== null && NOT_SENT_CODES.has(code)
}

function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const code = causeCode(err)
  return (code ? `${message} (${code})` : message).slice(0, 500)
}

async function failStaleClaims(now: Date): Promise<void> {
  await AppDataSource.getRepository(MetrikaConversion).update(
    { state: 'sending', claimedAt: LessThanOrEqual(new Date(now.getTime() - STALE_CLAIM_MS)) },
    { state: 'failed', lastError: UNKNOWN_OUTCOME },
  )
}

// Захватывает готовые записи (sending) в одной транзакции с блокировкой
// FOR UPDATE SKIP LOCKED: два обработчика не возьмут одну запись.
async function claimDue(now: Date, batchSize: number): Promise<MetrikaConversion[]> {
  return AppDataSource.transaction(async (em) => {
    const repo = em.getRepository(MetrikaConversion)
    const rows = await repo.find({
      where: { state: 'pending', nextAttemptAt: LessThanOrEqual(now) },
      order: { createdAt: 'ASC' },
      take: batchSize,
      lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
    })
    if (rows.length > 0) {
      await repo.update({ id: In(rows.map((r) => r.id)) }, { state: 'sending', claimedAt: now })
    }
    return rows
  })
}

// Берёт готовые записи, отправляет их одним CSV и помечает результат. Метрика
// принимает только прошлое время конверсии, поэтому «из будущего» (часы
// сервера и платёжной системы могут расходиться) прижимаем к секунде назад.
export async function processDueConversions(
  client: Pick<MetrikaClient, 'uploadConversions'>,
  counterId: string,
  { now = new Date(), batchSize = BATCH_SIZE }: { now?: Date; batchSize?: number } = {},
): Promise<ProcessResult> {
  const repo = AppDataSource.getRepository(MetrikaConversion)
  const result: ProcessResult = { sent: 0, retried: 0, failed: 0, unknown: 0 }

  await failStaleClaims(now)
  const rows = await claimDue(now, batchSize)
  if (rows.length === 0) return result
  const ids = rows.map((r) => r.id)

  const latest = now.getTime() - 1000
  const file: ConversionRow[] = rows.map((r) => ({
    yclid: r.yclid,
    target: r.target,
    priceRub: r.priceRub,
    eventAt: new Date(Math.min(r.eventAt.getTime(), latest)),
  }))

  let upload
  try {
    upload = await client.uploadConversions(counterId, file)
  } catch (err) {
    if (err instanceof RateLimitError) {
      // Просьба подождать — не неудача: попытки не считаем.
      await repo.update(
        { id: In(ids) },
        {
          state: 'pending',
          claimedAt: null,
          nextAttemptAt: new Date(now.getTime() + Math.max(err.retryAfterMs, 30_000)),
        },
      )
      return result
    }
    const message = describeError(err)
    console.error('metrika: загрузка конверсий не удалась:', message)
    if (!isDefinitelyNotAccepted(err)) {
      // Записи остаются в sending: через STALE_CLAIM_MS сдадутся с пояснением.
      result.unknown = rows.length
      return result
    }
    await AppDataSource.transaction(async (em) => {
      const tx = em.getRepository(MetrikaConversion)
      for (const row of rows) {
        const attempts = row.attempts + 1
        if (now.getTime() - row.createdAt.getTime() >= GIVE_UP_AFTER_MS) {
          await tx.update(
            { id: row.id },
            { state: 'failed', claimedAt: null, attempts, lastError: message },
          )
          result.failed += 1
        } else {
          await tx.update(
            { id: row.id },
            {
              state: 'pending',
              claimedAt: null,
              attempts,
              lastError: message,
              nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)),
            },
          )
          result.retried += 1
        }
      }
    })
    return result
  }

  // Файл принят. Если запись об этом в базу не удалась, повторно не шлём:
  // записи остаются в sending и сдадутся с пометкой «исход неизвестен».
  const accepted = upload.lineQuantity >= rows.length
  const note = accepted
    ? null
    : `Метрика приняла не все строки (${upload.lineQuantity} из ${rows.length}), см. отчёт «Офлайн-конверсии», загрузка № ${upload.uploadId}`
  try {
    await repo.update(
      { id: In(ids) },
      {
        state: 'sent',
        uploadId: String(upload.uploadId),
        sentAt: now,
        claimedAt: null,
        lastError: note,
      },
    )
  } catch (err) {
    console.error(
      `metrika: загрузка № ${upload.uploadId} принята, но записать это в базу не удалось:`,
      describeError(err),
    )
    result.unknown = rows.length
    return result
  }
  result.sent = rows.length
  if (note) {
    // Какие именно строки не прошли, Метрика не говорит. Значения (yclid) не пишем.
    console.warn('metrika: принято строк меньше, чем отправлено', {
      uploadId: upload.uploadId,
      sent: rows.length,
      accepted: upload.lineQuantity,
    })
  }
  return result
}

// Счётчик из настроек сайта (там его вносят в админке), иначе из env.
export async function resolveCounterId(env: NodeJS.ProcessEnv): Promise<string | null> {
  const fromSettings = (await getSettings()).metrikaId?.trim()
  if (fromSettings && /^\d+$/.test(fromSettings)) return fromSettings
  const fromEnv = env.METRIKA_COUNTER_ID?.trim()
  return fromEnv && /^\d+$/.test(fromEnv) ? fromEnv : null
}

// Запускает цикл отправки. Без флага, без токена и вне production не стартует
// (null): боевой токен в dev-окружении не должен получать тестовые оплаты.
export function startMetrikaConversionWorker({
  env = process.env,
  intervalMs = MIN_MS,
  client,
}: {
  env?: NodeJS.ProcessEnv
  intervalMs?: number
  client?: Pick<MetrikaClient, 'uploadConversions'>
} = {}): NodeJS.Timeout | null {
  if (!metrikaOfflineEnabled(env)) return null
  if (env.NODE_ENV !== 'production') {
    console.warn('metrika: отправка конверсий включена, но NODE_ENV не production: не запускаем')
    return null
  }
  const metrika = client ?? MetrikaClient.fromEnv(env)
  if (!metrika) {
    console.warn(
      'metrika: METRIKA_OFFLINE_ENABLED=true, но METRIKA_OAUTH_TOKEN не задан: конверсии не отправляются',
    )
    return null
  }

  let running = false
  let warnedNoCounter = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const counterId = await resolveCounterId(env)
      if (!counterId) {
        if (!warnedNoCounter) {
          console.warn('metrika: не задан номер счётчика (настройки сайта или METRIKA_COUNTER_ID)')
          warnedNoCounter = true
        }
        return
      }
      warnedNoCounter = false
      await processDueConversions(metrika, counterId)
    } catch (err) {
      console.error('metrika: сбой цикла отправки конверсий', err)
    } finally {
      running = false
    }
  }
  const timer = setInterval(() => void tick(), intervalMs)
  timer.unref()
  return timer
}
