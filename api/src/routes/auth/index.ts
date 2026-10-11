import { randomBytes } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import argon2 from 'argon2'
import { IsNull } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import { AdminUser } from '../../entities/AdminUser.js'
import { AdminSession } from '../../entities/AdminSession.js'
import { ApiError, badRequest } from '../errors.js'
import { ChangePasswordSchema, LoginSchema } from './schemas.js'
import { checkNewPassword } from './passwordPolicy.js'
import {
  CSRF_COOKIE_NAME,
  DEFAULT_SEED_PASSWORD,
  DUMMY_ARGON2_HASH,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  SESSION_MAX_AGE_SECONDS,
} from './constants.js'
import {
  hashSessionToken,
  requireAdminAuth,
  requireCsrfToken,
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

// Новая запись сессии админки: общая для входа и для перевыпуска сессии после
// смены пароля.
function newSessionRow(req: Request, adminUserId: string, rawToken: string) {
  return {
    tokenHash: hashSessionToken(rawToken),
    adminUserId,
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
    revokedAt: null,
    createdIp: req.ip ?? null,
    userAgent: (req.headers['user-agent'] ?? '').slice(0, 500) || null,
  }
}

function publicUser(user: AdminUser) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  }
}

// Лимит попыток входа с одного IP стоит в app.ts (guard), а не здесь.
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

    // Флаг «пароль по умолчанию» следует за последним входом: вошёл с паролем из
    // сида (он лежит в репозитории) — просим сменить; вошёл со своим — снимаем
    // флаг, который мог застрять, если пароль меняли в обход интерфейса.
    const usesDefault = password === DEFAULT_SEED_PASSWORD
    if (usesDefault !== user.mustChangePassword) {
      user.mustChangePassword = usesDefault
      await userRepo.update({ id: user.id }, { mustChangePassword: usesDefault })
    }

    const rawToken = randomBytes(32).toString('base64url')
    const csrfToken = randomBytes(32).toString('base64url')
    const sessionRepo = AppDataSource.getRepository(AdminSession)
    await sessionRepo.save(sessionRepo.create(newSessionRow(req, user.id, rawToken)))

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

// Смена своего пароля. Лимит попыток с одного IP стоит в app.ts (guard): текущий
// пароль можно подбирать краденой сессией. Пользователь блокируется на время
// транзакции, и текущий пароль проверяется по свежему хэшу: две одновременные
// смены не пройдут обе. После смены отзываются ВСЕ сессии пользователя, включая
// текущую, и выдаётся новая (токен и CSRF): украденная копия сессии не живёт
// дальше.
authRouter.post('/password', requireAdminAuth, requireCsrfToken, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = ChangePasswordSchema.parse(req.body)
    const userId = req.adminUser!.id
    const rawToken = randomBytes(32).toString('base64url')
    const csrfToken = randomBytes(32).toString('base64url')

    await AppDataSource.transaction(async (em) => {
      const fresh = await em.findOneOrFail(AdminUser, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!(await argon2.verify(fresh.passwordHash, currentPassword))) {
        console.warn('admin: неверный текущий пароль при смене пароля', {
          adminUserId: userId,
          ip: req.ip,
        })
        throw badRequest('invalid_current_password', 'Текущий пароль указан неверно')
      }
      const problem = checkNewPassword(newPassword, currentPassword, fresh.email)
      if (problem) throw problem

      await em.update(
        AdminUser,
        { id: userId },
        { passwordHash: await argon2.hash(newPassword), mustChangePassword: false },
      )
      await em.update(
        AdminSession,
        { adminUserId: userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      )
      await em.save(em.create(AdminSession, newSessionRow(req, userId, rawToken)))
    })

    console.info('admin: пароль изменён, сессии перевыпущены', { adminUserId: userId, ip: req.ip })
    setSessionCookies(res, rawToken, csrfToken)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

authRouter.get('/me', requireAdminAuth, (req, res) => {
  // requireAdminAuth guarantees req.adminUser is set.
  res.json({ data: publicUser(req.adminUser!) })
})
