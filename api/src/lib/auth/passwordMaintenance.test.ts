import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import argon2 from 'argon2'
import { AppDataSource } from '../../config/dataSource.js'
import { AdminUser } from '../../entities/AdminUser.js'
import { AdminSession } from '../../entities/AdminSession.js'
import { DEFAULT_SEED_PASSWORD } from '../../routes/auth/constants.js'
import { flagDefaultPasswordUsers, resetAdminPassword } from './passwordMaintenance.js'

// Две служебные операции вокруг пароля по умолчанию из сида: проверка при
// старте api (кто ещё с ним живёт) и серверный сброс пароля (если владелец
// заблокирован или хочет заменить слабый пароль, не заходя в интерфейс).

describe('passwordMaintenance', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE admin_sessions, admin_users RESTART IDENTITY CASCADE')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function addUser(email: string, password: string, over: Partial<AdminUser> = {}) {
    const repo = AppDataSource.getRepository(AdminUser)
    return repo.save(
      repo.create({ email, passwordHash: await argon2.hash(password), role: 'admin', ...over }),
    )
  }
  const userOf = (email: string) =>
    AppDataSource.getRepository(AdminUser).findOneByOrFail({ email })

  describe('flagDefaultPasswordUsers (при старте api)', () => {
    it('помечает тех, у кого пароль сида, остальных не трогает; возвращает их email', async () => {
      await addUser('seed@x.ru', DEFAULT_SEED_PASSWORD)
      await addUser('owner@x.ru', 'очень-надёжный-пароль-1')
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      const flagged = await flagDefaultPasswordUsers()

      expect(flagged).toEqual(['seed@x.ru'])
      expect((await userOf('seed@x.ru')).mustChangePassword).toBe(true)
      expect((await userOf('owner@x.ru')).mustChangePassword).toBe(false)
    })

    it('пишет предупреждение в лог с email, но без пароля', async () => {
      await addUser('seed@x.ru', DEFAULT_SEED_PASSWORD)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      await flagDefaultPasswordUsers()

      expect(warn).toHaveBeenCalledTimes(1)
      const text = JSON.stringify(warn.mock.calls[0])
      expect(text).toContain('seed@x.ru')
      expect(text).not.toContain(DEFAULT_SEED_PASSWORD)
    })

    it('снимает застрявший флаг у того, чей пароль уже сменён', async () => {
      await addUser('owner@x.ru', 'очень-надёжный-пароль-1', { mustChangePassword: true })

      const flagged = await flagDefaultPasswordUsers()

      expect(flagged).toEqual([])
      expect((await userOf('owner@x.ru')).mustChangePassword).toBe(false)
    })

    it('нет слабых паролей: тишина в логе', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      await addUser('owner@x.ru', 'очень-надёжный-пароль-1')

      expect(await flagDefaultPasswordUsers()).toEqual([])
      expect(warn).not.toHaveBeenCalled()
    })

    it('повреждённый хэш одного пользователя не мешает проверить остальных', async () => {
      await AppDataSource.getRepository(AdminUser).save(
        AppDataSource.getRepository(AdminUser).create({
          email: 'broken@x.ru',
          passwordHash: 'не-хэш',
          role: 'editor',
        }),
      )
      await addUser('seed@x.ru', DEFAULT_SEED_PASSWORD)
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      expect(await flagDefaultPasswordUsers()).toEqual(['seed@x.ru'])
    })
  })

  describe('resetAdminPassword (команда на сервере)', () => {
    it('задаёт случайный пароль: он возвращается, подходит к хэшу, длинный', async () => {
      await addUser('owner@x.ru', 'старый-пароль-пароль')

      const password = await resetAdminPassword('owner@x.ru')

      expect(password.length).toBeGreaterThanOrEqual(20)
      const user = await userOf('owner@x.ru')
      expect(await argon2.verify(user.passwordHash, password)).toBe(true)
      expect(await argon2.verify(user.passwordHash, 'старый-пароль-пароль')).toBe(false)
    })

    it('каждый вызов даёт другой пароль', async () => {
      await addUser('owner@x.ru', 'старый-пароль-пароль')

      const first = await resetAdminPassword('owner@x.ru')
      const second = await resetAdminPassword('owner@x.ru')

      expect(first).not.toBe(second)
    })

    it('отзывает все сессии пользователя и снимает флаг, чужие сессии не трогает', async () => {
      const owner = await addUser('owner@x.ru', 'старый-пароль-пароль', {
        mustChangePassword: true,
      })
      const other = await addUser('other@x.ru', 'другой-пароль-пароль')
      const sessions = AppDataSource.getRepository(AdminSession)
      const mk = (userId: string, hash: string) =>
        sessions.save(
          sessions.create({
            tokenHash: hash,
            adminUserId: userId,
            expiresAt: new Date(Date.now() + 86_400_000),
            revokedAt: null,
            createdIp: null,
            userAgent: null,
          }),
        )
      const ownerSession = await mk(owner.id, 'hash-owner')
      const otherSession = await mk(other.id, 'hash-other')

      await resetAdminPassword('owner@x.ru')

      expect((await sessions.findOneByOrFail({ id: ownerSession.id })).revokedAt).not.toBeNull()
      expect((await sessions.findOneByOrFail({ id: otherSession.id })).revokedAt).toBeNull()
      expect((await userOf('owner@x.ru')).mustChangePassword).toBe(false)
    })

    it('email без учёта регистра и пробелов', async () => {
      await addUser('owner@x.ru', 'старый-пароль-пароль')

      await expect(resetAdminPassword('  Owner@X.ru ')).resolves.toBeTypeOf('string')
    })

    it('неизвестный email: понятная ошибка, ничего не меняется', async () => {
      await addUser('owner@x.ru', 'старый-пароль-пароль')

      await expect(resetAdminPassword('нет@x.ru')).rejects.toThrow(/не найден/i)
      const user = await userOf('owner@x.ru')
      expect(await argon2.verify(user.passwordHash, 'старый-пароль-пароль')).toBe(true)
    })
  })
})
