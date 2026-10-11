import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import argon2 from 'argon2'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { AdminUser } from '../entities/AdminUser.js'
import { DEFAULT_SEED_PASSWORD } from './auth/constants.js'
import {
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  TEST_EDITOR_EMAIL,
  authHeaders,
  loginAsAdmin,
  loginAsEditor,
  type AdminAuth,
} from './testUtils.js'

// Смена пароля админа из интерфейса. Раньше пароль можно было поменять только
// прямым SQL, а сид раздаёт всем одинаковый пароль по умолчанию.

const NEW_PASSWORD = 'новый-надёжный-пароль-2026'

describe('смена пароля админа', () => {
  let app: ReturnType<typeof createApp>
  let admin: AdminAuth

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    app = createApp()
    await AppDataSource.query('TRUNCATE admin_sessions, admin_users RESTART IDENTITY CASCADE')
    admin = await loginAsAdmin(app)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const change = (auth: AdminAuth, body: Record<string, unknown>) =>
    request(app).post('/api/auth/password').set(authHeaders(auth)).send(body)

  const loginWith = (email: string, password: string) =>
    request(app).post('/api/auth/login').send({ email, password })

  describe('успешная смена', () => {
    it('204: войти можно новым паролем, старым нельзя', async () => {
      const res = await change(admin, {
        currentPassword: TEST_ADMIN_PASSWORD,
        newPassword: NEW_PASSWORD,
      })

      expect(res.status).toBe(204)
      expect((await loginWith(TEST_ADMIN_EMAIL, NEW_PASSWORD)).status).toBe(200)
      expect((await loginWith(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD)).status).toBe(401)
    })

    it('в базе лежит argon2-хэш, а не сам пароль', async () => {
      await change(admin, { currentPassword: TEST_ADMIN_PASSWORD, newPassword: NEW_PASSWORD })

      const user = await AppDataSource.getRepository(AdminUser).findOneByOrFail({
        email: TEST_ADMIN_EMAIL,
      })
      expect(user.passwordHash).not.toContain(NEW_PASSWORD)
      expect(await argon2.verify(user.passwordHash, NEW_PASSWORD)).toBe(true)
    })

    it('все сессии пользователя отзываются, включая ту, из которой меняли: токен перевыпускается', async () => {
      const other = await loginAsAdmin(app)

      const res = await change(admin, {
        currentPassword: TEST_ADMIN_PASSWORD,
        newPassword: NEW_PASSWORD,
      })

      expect((await request(app).get('/api/auth/me').set(authHeaders(other))).status).toBe(401)
      // Старый токен текущей сессии тоже мёртв: украденная копия не доживёт 30 дней.
      expect((await request(app).get('/api/auth/me').set(authHeaders(admin))).status).toBe(401)
      // А в ответе пришли новые cookie, с ними работа продолжается.
      const fresh = res.headers['set-cookie'] as unknown as string[]
      const me = await request(app).get('/api/auth/me').set('Cookie', fresh.join('; '))
      expect(me.status).toBe(200)
      expect(me.body.data.email).toBe(TEST_ADMIN_EMAIL)
    })

    it('новые cookie: сессия и CSRF другие, чем были', async () => {
      const res = await change(admin, {
        currentPassword: TEST_ADMIN_PASSWORD,
        newPassword: NEW_PASSWORD,
      })

      const fresh = res.headers['set-cookie'] as unknown as string[]
      const session = fresh.find((c) => c.startsWith('ximi4ka_shop_session='))!
      const csrf = fresh.find((c) => c.startsWith('ximi4ka_shop_csrf='))!
      expect(session.split(';')[0]).not.toBe(admin.sessionCookie.split(';')[0])
      expect(csrf.split(';')[0]).not.toBe(admin.csrfCookie.split(';')[0])
      expect(session).toContain('HttpOnly')
    })

    it('две одновременные смены из разных сессий: проходит одна, вторая видит уже новый пароль', async () => {
      const other = await loginAsAdmin(app)

      const results = await Promise.all([
        change(admin, { currentPassword: TEST_ADMIN_PASSWORD, newPassword: NEW_PASSWORD }),
        change(other, {
          currentPassword: TEST_ADMIN_PASSWORD,
          newPassword: 'другой-надёжный-пароль-2026',
        }),
      ])

      expect(results.map((r) => r.status).sort()).toEqual([204, 400])
      const failed = results.find((r) => r.status === 400)!
      expect(failed.body.error.code).toBe('invalid_current_password')
    })

    it('сессии других пользователей не трогаются', async () => {
      const editor = await loginAsEditor(app)

      await change(admin, { currentPassword: TEST_ADMIN_PASSWORD, newPassword: NEW_PASSWORD })

      expect((await request(app).get('/api/auth/me').set(authHeaders(editor))).status).toBe(200)
    })

    it('редактор меняет свой пароль так же', async () => {
      const editor = await loginAsEditor(app)

      const res = await change(editor, {
        currentPassword: TEST_ADMIN_PASSWORD,
        newPassword: NEW_PASSWORD,
      })

      expect(res.status).toBe(204)
      expect((await loginWith(TEST_EDITOR_EMAIL, NEW_PASSWORD)).status).toBe(200)
      expect((await loginWith(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD)).status).toBe(200)
    })
  })

  describe('отказы', () => {
    it('неверный текущий пароль: 400, пароль не меняется', async () => {
      const res = await change(admin, { currentPassword: 'не тот', newPassword: NEW_PASSWORD })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('invalid_current_password')
      expect((await loginWith(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD)).status).toBe(200)
    })

    it('новый короче 12 знаков', async () => {
      const res = await change(admin, {
        currentPassword: TEST_ADMIN_PASSWORD,
        newPassword: 'коротко123',
      })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('password_too_short')
    })

    it('сначала проверяется текущий пароль: с неверным текущим и коротким новым ответ про текущий', async () => {
      const res = await change(admin, { currentPassword: 'не тот', newPassword: 'коротко' })

      expect(res.body.error.code).toBe('invalid_current_password')
    })

    it('длина считается символами, а не единицами UTF-16: 6 эмодзи — это 6, а не 12', async () => {
      const res = await change(admin, {
        currentPassword: TEST_ADMIN_PASSWORD,
        newPassword: '😀'.repeat(6),
      })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('password_too_short')
    })

    it('12 разных эмодзи — достаточно', async () => {
      const res = await change(admin, {
        currentPassword: TEST_ADMIN_PASSWORD,
        newPassword: '😀😁😂😃😄😅😆😇😈😉😊😋',
      })

      expect(res.status).toBe(204)
    })

    it.each([
      ['одни пробелы', ' '.repeat(14)],
      ['один повторяющийся символ', 'a'.repeat(14)],
      ['email админа', TEST_ADMIN_EMAIL],
    ])('слишком простой пароль (%s)', async (_name, newPassword) => {
      const res = await change(admin, { currentPassword: TEST_ADMIN_PASSWORD, newPassword })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('password_too_weak')
    })

    it('новый совпадает с текущим', async () => {
      const res = await change(admin, {
        currentPassword: TEST_ADMIN_PASSWORD,
        newPassword: TEST_ADMIN_PASSWORD,
      })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('password_unchanged')
    })

    it('новый равен паролю по умолчанию из сида', async () => {
      const res = await change(admin, {
        currentPassword: TEST_ADMIN_PASSWORD,
        newPassword: DEFAULT_SEED_PASSWORD,
      })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('password_too_common')
    })

    it.each([
      ['нет полей', {}],
      ['пароль не строка', { currentPassword: TEST_ADMIN_PASSWORD, newPassword: 123456789012 }],
      [
        'слишком длинный (больше 256)',
        { currentPassword: TEST_ADMIN_PASSWORD, newPassword: 'a'.repeat(300) },
      ],
    ])('мусорное тело (%s): 400 без смены пароля', async (_name, body) => {
      const res = await change(admin, body)

      expect(res.status).toBe(400)
      expect((await loginWith(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD)).status).toBe(200)
    })

    it('без входа 401', async () => {
      const res = await request(app)
        .post('/api/auth/password')
        .send({ currentPassword: TEST_ADMIN_PASSWORD, newPassword: NEW_PASSWORD })

      expect(res.status).toBe(401)
    })

    it('без CSRF-токена 403 csrf_failed, пароль не меняется', async () => {
      const res = await request(app)
        .post('/api/auth/password')
        .set('Cookie', authHeaders(admin).Cookie)
        .send({ currentPassword: TEST_ADMIN_PASSWORD, newPassword: NEW_PASSWORD })

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('csrf_failed')
      expect((await loginWith(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD)).status).toBe(200)
    })

    it('ответ с ошибкой не содержит ни хэша, ни введённых паролей', async () => {
      const res = await change(admin, {
        currentPassword: 'секретный-неверный',
        newPassword: NEW_PASSWORD,
      })

      const text = JSON.stringify(res.body)
      expect(text).not.toContain('argon2')
      expect(text).not.toContain('секретный-неверный')
      expect(text).not.toContain(NEW_PASSWORD)
    })
  })

  describe('пароль по умолчанию из сида', () => {
    async function seedDefaultUser(email = 'seed@test.local') {
      await AppDataSource.getRepository(AdminUser).save(
        AppDataSource.getRepository(AdminUser).create({
          email,
          passwordHash: await argon2.hash(DEFAULT_SEED_PASSWORD),
          role: 'admin',
        }),
      )
      return email
    }

    it('вход со стандартным паролем помечает пользователя: mustChangePassword в ответе входа и в /me', async () => {
      const email = await seedDefaultUser()

      const login = await loginWith(email, DEFAULT_SEED_PASSWORD)

      expect(login.status).toBe(200)
      expect(login.body.data.mustChangePassword).toBe(true)
      const cookies = login.headers['set-cookie'] as unknown as string[]
      const me = await request(app).get('/api/auth/me').set('Cookie', cookies.join('; '))
      expect(me.body.data.mustChangePassword).toBe(true)
    })

    it('повторный вход со стандартным паролем, когда флаг уже стоит: остаётся true, без ошибок', async () => {
      const email = await seedDefaultUser()
      await loginWith(email, DEFAULT_SEED_PASSWORD)

      const again = await loginWith(email, DEFAULT_SEED_PASSWORD)

      expect(again.status).toBe(200)
      expect(again.body.data.mustChangePassword).toBe(true)
    })

    it('застрявший флаг снимается при входе со своим паролем (пароль меняли в обход интерфейса)', async () => {
      await AppDataSource.getRepository(AdminUser).update(
        { email: TEST_ADMIN_EMAIL },
        { mustChangePassword: true },
      )

      const login = await loginWith(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD)

      expect(login.body.data.mustChangePassword).toBe(false)
      const user = await AppDataSource.getRepository(AdminUser).findOneByOrFail({
        email: TEST_ADMIN_EMAIL,
      })
      expect(user.mustChangePassword).toBe(false)
    })

    it('вход со своим паролем флаг не ставит', async () => {
      const login = await loginWith(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD)

      expect(login.body.data.mustChangePassword).toBe(false)
    })

    it('после смены пароля флаг снимается', async () => {
      const email = await seedDefaultUser()
      const login = await loginWith(email, DEFAULT_SEED_PASSWORD)
      const cookies = login.headers['set-cookie'] as unknown as string[]
      const csrf = cookies
        .find((c) => c.startsWith('ximi4ka_shop_csrf='))!
        .split(';')[0]
        .split('=')[1]

      const res = await request(app)
        .post('/api/auth/password')
        .set('Cookie', cookies.join('; '))
        .set('X-CSRF-Token', csrf)
        .send({ currentPassword: DEFAULT_SEED_PASSWORD, newPassword: NEW_PASSWORD })

      expect(res.status).toBe(204)
      const user = await AppDataSource.getRepository(AdminUser).findOneByOrFail({ email })
      expect(user.mustChangePassword).toBe(false)
      expect((await loginWith(email, NEW_PASSWORD)).body.data.mustChangePassword).toBe(false)
    })
  })

  describe('лимит попыток', () => {
    it('после лимита 429, неверный пароль тоже считается', async () => {
      vi.stubEnv('PASSWORD_RATE_LIMIT', '2')
      const limited = createApp()
      const auth = await loginAsAdmin(limited)
      const post = (path = '/api/auth/password') =>
        request(limited)
          .post(path)
          .set(authHeaders(auth))
          .send({ currentPassword: 'не тот', newPassword: NEW_PASSWORD })

      expect((await post()).status).toBe(400)
      expect((await post()).status).toBe(400)
      const blocked = await post()

      expect(blocked.status).toBe(429)
      expect(blocked.body.error.code).toBe('rate_limited')
    })

    it.each(['/api/auth//password', '/api/auth/password/', '/API/AUTH/PASSWORD'])(
      'лимит нельзя обойти записью пути «%s»',
      async (path) => {
        vi.stubEnv('PASSWORD_RATE_LIMIT', '2')
        const limited = createApp()
        const auth = await loginAsAdmin(limited)
        const post = (p: string) =>
          request(limited)
            .post(p)
            .set(authHeaders(auth))
            .send({ currentPassword: 'не тот', newPassword: NEW_PASSWORD })

        await post('/api/auth/password')
        await post(path)

        expect((await post(path)).status).toBe(429)
      },
    )
  })
})
