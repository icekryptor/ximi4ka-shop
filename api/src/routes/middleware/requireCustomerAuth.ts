import type { Request, Response, NextFunction } from 'express'
import type { Customer } from '../../entities/Customer.js'
import type { CustomerSession } from '../../entities/CustomerSession.js'
import { findCustomerSession } from '../../lib/account/session.js'
import { ApiError } from '../errors.js'
import { CUSTOMER_CSRF_COOKIE } from '../account/constants.js'

declare module 'express-serve-static-core' {
  interface Request {
    customer?: Customer
    customerSession?: CustomerSession
  }
}

export async function requireCustomerAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const found = await findCustomerSession(req)
    if (!found) return next(new ApiError(401, 'auth_required', 'Войдите в личный кабинет'))
    req.customer = found.customer
    req.customerSession = found.session
    next()
  } catch (err) {
    next(err)
  }
}

export function requireCustomerCsrf(req: Request, _res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
  const cookie = req.cookies?.[CUSTOMER_CSRF_COOKIE]
  const header = req.headers['x-csrf-token']
  if (typeof cookie !== 'string' || typeof header !== 'string' || !cookie || cookie !== header) {
    return next(new ApiError(403, 'csrf_failed', 'CSRF token invalid or missing'))
  }
  next()
}
