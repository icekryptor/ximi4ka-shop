import { createHash } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { IsNull } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import { AdminSession } from '../../entities/AdminSession.js'
import type { AdminUser } from '../../entities/AdminUser.js'
import { ApiError } from '../errors.js'
import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from '../auth/constants.js'

// Augment the Express Request type with the fields we attach after a
// successful auth check. Declared here so every consumer imports it for free.
declare module 'express-serve-static-core' {
  interface Request {
    adminUser?: AdminUser
    adminSession?: AdminSession
  }
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function requireAdminAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE_NAME]
  if (!token || typeof token !== 'string') {
    return next(new ApiError(401, 'auth_required', 'Authentication required'))
  }

  const tokenHash = hashSessionToken(token)
  const session = await AppDataSource.getRepository(AdminSession).findOne({
    where: { tokenHash, revokedAt: IsNull() },
    relations: { adminUser: true },
  })

  if (!session || session.expiresAt.getTime() < Date.now()) {
    return next(new ApiError(401, 'auth_required', 'Authentication required'))
  }

  req.adminUser = session.adminUser
  req.adminSession = session
  next()
}

export function requireCsrfToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next()
  }
  const cookie = req.cookies?.[CSRF_COOKIE_NAME]
  const header = req.headers['x-csrf-token']
  if (
    !cookie ||
    typeof cookie !== 'string' ||
    !header ||
    typeof header !== 'string' ||
    cookie !== header
  ) {
    return next(new ApiError(403, 'csrf_failed', 'CSRF token invalid or missing'))
  }
  next()
}
