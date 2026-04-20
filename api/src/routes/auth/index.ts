import { randomBytes } from 'node:crypto'
import { Router, type Response } from 'express'
import argon2 from 'argon2'
import { AppDataSource } from '../../config/dataSource.js'
import { AdminUser } from '../../entities/AdminUser.js'
import { AdminSession } from '../../entities/AdminSession.js'
import { ApiError } from '../errors.js'
import { LoginSchema } from './schemas.js'
import {
  CSRF_COOKIE_NAME,
  DUMMY_ARGON2_HASH,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  SESSION_MAX_AGE_SECONDS,
} from './constants.js'
import {
  hashSessionToken,
  requireAdminAuth,
} from '../middleware/requireAdminAuth.js'

export const authRouter: Router = Router()

function isSecureCookie(): boolean {
  return process.env.NODE_ENV === 'production'
}

function setSessionCookies(res: Response, sessionToken: string, csrfToken: string): void {
  const secure = isSecureCookie()
  res.cookie(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  })
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    // Client JS MUST be able to read this to echo it in the X-CSRF-Token header.
    httpOnly: false,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  })
}

function clearSessionCookies(res: Response): void {
  const secure = isSecureCookie()
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
  })
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    path: '/',
  })
}

function publicUser(user: AdminUser) {
  return { id: user.id, email: user.email, role: user.role }
}

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = LoginSchema.parse(req.body)

    const userRepo = AppDataSource.getRepository(AdminUser)
    const user = await userRepo.findOneBy({ email })

    // Always run argon2.verify — on unknown-email we verify against a dummy
    // hash so wall-clock time doesn't leak account existence.
    let verified = false
    if (user) {
      verified = await argon2.verify(user.passwordHash, password)
    } else {
      // Burn roughly the same CPU as a real verify so timing matches.
      await argon2.verify(DUMMY_ARGON2_HASH, password).catch(() => false)
    }

    if (!user || !verified) {
      throw new ApiError(401, 'invalid_credentials', 'Invalid email or password')
    }

    const rawToken = randomBytes(32).toString('base64url')
    const csrfToken = randomBytes(32).toString('base64url')
    const tokenHash = hashSessionToken(rawToken)

    const sessionRepo = AppDataSource.getRepository(AdminSession)
    await sessionRepo.save(
      sessionRepo.create({
        tokenHash,
        adminUserId: user.id,
        expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
        revokedAt: null,
        createdIp: req.ip ?? null,
        userAgent: (req.headers['user-agent'] ?? '').slice(0, 500) || null,
      }),
    )

    setSessionCookies(res, rawToken, csrfToken)
    res.json({ data: publicUser(user) })
  } catch (err) {
    next(err)
  }
})

authRouter.post('/logout', requireAdminAuth, async (req, res, next) => {
  try {
    const session = req.adminSession
    if (session) {
      const sessionRepo = AppDataSource.getRepository(AdminSession)
      session.revokedAt = new Date()
      await sessionRepo.save(session)
    }
    clearSessionCookies(res)
    res.json({ data: { ok: true } })
  } catch (err) {
    next(err)
  }
})

authRouter.get('/me', requireAdminAuth, (req, res) => {
  // requireAdminAuth guarantees req.adminUser is set.
  res.json({ data: publicUser(req.adminUser!) })
})
