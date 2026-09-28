import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { IsNull, MoreThan } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import { CustomerEmailCode } from '../../entities/CustomerEmailCode.js'
import {
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_TTL_MS,
  EMAIL_MAX_PER_HOUR,
  EMAIL_RESEND_INTERVAL_MS,
} from '../../routes/account/constants.js'

export type IssueCodeResult =
  | { ok: true; id: string; code: string }
  | { ok: false; reason: 'too_soon' | 'hourly_limit'; retryAfterSec: number }

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_code'; attemptsLeft: number }
  | { ok: false; reason: 'code_expired' }

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function hashCode(id: string, code: string): string {
  return createHash('sha256').update(`${id}:${code}`).digest('hex')
}

export async function issueEmailCode(email: string, now = new Date()): Promise<IssueCodeResult> {
  const repo = AppDataSource.getRepository(CustomerEmailCode)
  const last = await repo.findOne({ where: { email }, order: { createdAt: 'DESC' } })
  if (last) {
    const wait = last.createdAt.getTime() + EMAIL_RESEND_INTERVAL_MS - now.getTime()
    if (wait > 0) return { ok: false, reason: 'too_soon', retryAfterSec: Math.ceil(wait / 1000) }
  }
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const lastHour = await repo.count({ where: { email, createdAt: MoreThan(hourAgo) } })
  if (lastHour >= EMAIL_MAX_PER_HOUR)
    return { ok: false, reason: 'hourly_limit', retryAfterSec: 3600 }

  const id = randomUUID()
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await repo.insert({
    id,
    email,
    codeHash: hashCode(id, code),
    attempts: 0,
    expiresAt: new Date(now.getTime() + EMAIL_CODE_TTL_MS),
    consumedAt: null,
    createdAt: now,
  })
  return { ok: true, id, code }
}

// Письмо не ушло — код не должен считаться отправленным (интервал 60 с).
export async function discardEmailCode(id: string): Promise<void> {
  await AppDataSource.getRepository(CustomerEmailCode).delete({ id })
}

// Проверяется только последний неиспользованный код адреса. Попытка
// списывается атомарно ДО сравнения: параллельные подборы не обойдут лимит.
export async function verifyEmailCode(
  email: string,
  code: string,
  now = new Date(),
): Promise<VerifyCodeResult> {
  const repo = AppDataSource.getRepository(CustomerEmailCode)
  const row = await repo.findOne({
    where: { email, consumedAt: IsNull() },
    order: { createdAt: 'DESC' },
  })
  if (!row) return { ok: false, reason: 'code_expired' }

  const bumped = await repo
    .createQueryBuilder()
    .update(CustomerEmailCode)
    .set({ attempts: () => 'attempts + 1' })
    .where('id = :id AND attempts < :max AND consumed_at IS NULL AND expires_at > :now', {
      id: row.id,
      max: EMAIL_CODE_MAX_ATTEMPTS,
      now,
    })
    .returning(['attempts'])
    .execute()
  const rows = bumped.raw as Array<{ attempts: number }>
  if (rows.length !== 1) return { ok: false, reason: 'code_expired' }

  const a = Buffer.from(hashCode(row.id, code))
  const b = Buffer.from(row.codeHash)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    const left = EMAIL_CODE_MAX_ATTEMPTS - rows[0].attempts
    return left > 0
      ? { ok: false, reason: 'invalid_code', attemptsLeft: left }
      : { ok: false, reason: 'code_expired' }
  }

  const consumed = await repo
    .createQueryBuilder()
    .update(CustomerEmailCode)
    .set({ consumedAt: now })
    .where('id = :id AND consumed_at IS NULL', { id: row.id })
    .execute()
  return consumed.affected === 1 ? { ok: true } : { ok: false, reason: 'code_expired' }
}
