import { randomBytes } from 'node:crypto'
import type { Request, Response } from 'express'
import { IsNull } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import type { Customer } from '../../entities/Customer.js'
import { CustomerSession } from '../../entities/CustomerSession.js'
import { hashSessionToken } from '../../routes/middleware/requireAdminAuth.js'
import {
  CUSTOMER_CSRF_COOKIE,
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_MAX_AGE_MS,
} from '../../routes/account/constants.js'

export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

export function cookieBase() {
  return { sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' }
}

export async function startCustomerSession(
  req: Request,
  res: Response,
  customerId: string,
): Promise<void> {
  const raw = newToken()
  const csrf = newToken()
  const repo = AppDataSource.getRepository(CustomerSession)
  // Браузер, где уже был вход (своей или чужой сессией — например, общий
  // компьютер), не должен держать активными сразу две сессии в одной cookie:
  // предыдущая, чья токен-cookie сейчас пришла с запросом, отзывается.
  const prevRaw = req.cookies?.[CUSTOMER_SESSION_COOKIE]
  if (typeof prevRaw === 'string' && prevRaw) {
    await repo.update(
      { tokenHash: hashSessionToken(prevRaw), revokedAt: IsNull() },
      { revokedAt: new Date() },
    )
  }
  await repo.save(
    repo.create({
      tokenHash: hashSessionToken(raw),
      customerId,
      expiresAt: new Date(Date.now() + CUSTOMER_SESSION_MAX_AGE_MS),
      revokedAt: null,
      createdIp: req.ip ?? null,
      userAgent: (req.headers['user-agent'] ?? '').slice(0, 500) || null,
    }),
  )
  res.cookie(CUSTOMER_SESSION_COOKIE, raw, {
    ...cookieBase(),
    httpOnly: true,
    maxAge: CUSTOMER_SESSION_MAX_AGE_MS,
  })
  // Читаемая: клиент повторяет её в X-CSRF-Token.
  res.cookie(CUSTOMER_CSRF_COOKIE, csrf, {
    ...cookieBase(),
    httpOnly: false,
    maxAge: CUSTOMER_SESSION_MAX_AGE_MS,
  })
}

export function clearCustomerSessionCookies(res: Response): void {
  res.clearCookie(CUSTOMER_SESSION_COOKIE, { ...cookieBase(), httpOnly: true })
  res.clearCookie(CUSTOMER_CSRF_COOKIE, { ...cookieBase(), httpOnly: false })
}

// Не бросает: чекауту и опросу Telegram сессия нужна «если есть».
export async function findCustomerSession(
  req: Request,
): Promise<{ session: CustomerSession; customer: Customer } | null> {
  const raw = req.cookies?.[CUSTOMER_SESSION_COOKIE]
  if (!raw || typeof raw !== 'string') return null
  const session = await AppDataSource.getRepository(CustomerSession).findOne({
    where: { tokenHash: hashSessionToken(raw), revokedAt: IsNull() },
    relations: { customer: true },
  })
  if (!session || session.expiresAt.getTime() < Date.now()) return null
  return { session, customer: session.customer }
}
