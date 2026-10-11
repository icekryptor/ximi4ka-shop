import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { AdminUser } from '../entities/AdminUser.js'
import { Order } from '../entities/Order.js'
import { SiteSettings } from '../entities/SiteSettings.js'
import { EnsureOneAdminUser1790810000000 } from '../migrations/1790810000000-EnsureOneAdminUser.js'
import {
  TEST_ADMIN_EMAIL,
  authHeaders,
  loginAsAdmin,
  loginAsEditor,
  seedOrder,
  type AdminAuth,
} from './testUtils.js'

// Роли админки: admin — всё; editor — контент (товары, категории, страницы,
// блог, медиа, редиректы, ревизии), но не заказы (персональные данные
// покупателей, смена статуса оплаты) и не настройки сайта (счётчики, robots,
// оплата).

describe('роли админки', () => {
  let app: ReturnType<typeof createApp>
  let editor: AdminAuth
  let admin: AdminAuth

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    app = createApp()
    await AppDataSource.query(
      'TRUNCATE admin_sessions, admin_users, orders, order_items RESTART IDENTITY CASCADE',
    )
    editor = await loginAsEditor(app)
    admin = await loginAsAdmin(app)
  })

  const expectForbidden = (res: request.Response) => {
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('forbidden')
  }

  describe('заказы: только admin', () => {
    it('редактору нельзя читать список и карточку заказа (персональные данные)', async () => {
      const order = await seedOrder()

      expectForbidden(await request(app).get('/api/admin/orders').set(authHeaders(editor)))
      expectForbidden(
        await request(app).get(`/api/admin/orders/${order.id}`).set(authHeaders(editor)),
      )
    })

    it('редактор не может отметить заказ оплаченным: статус не меняется', async () => {
      const order = await seedOrder({ status: 'pending' })

      const res = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set(authHeaders(editor))
        .send({ status: 'paid' })

      expectForbidden(res)
      const after = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
      expect(after.status).toBe('pending')
      expect(after.paidAt).toBeNull()
    })

    it('отказ приходит раньше проверки тела: мусорный запрос редактора — 403, а не 400', async () => {
      const order = await seedOrder()

      const res = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set(authHeaders(editor))
        .send({ status: 'нет такого' })

      expectForbidden(res)
    })

    it('редактору нельзя повторять уведомления и заказ в СДЭК', async () => {
      const order = await seedOrder()

      expectForbidden(
        await request(app)
          .post(`/api/admin/orders/${order.id}/notifications/retry`)
          .set(authHeaders(editor)),
      )
      expectForbidden(
        await request(app)
          .post(`/api/admin/orders/${order.id}/cdek/retry`)
          .set(authHeaders(editor)),
      )
    })

    it('admin работает с заказами как раньше', async () => {
      const order = await seedOrder()

      const list = await request(app).get('/api/admin/orders').set(authHeaders(admin))
      const detail = await request(app).get(`/api/admin/orders/${order.id}`).set(authHeaders(admin))
      const patch = await request(app)
        .patch(`/api/admin/orders/${order.id}/status`)
        .set(authHeaders(admin))
        .send({ status: 'paid' })

      expect(list.status).toBe(200)
      expect(detail.status).toBe(200)
      expect(patch.status).toBe(200)
    })
  })

  describe('настройки сайта: только admin', () => {
    it('редактору нельзя ни читать, ни менять настройки; счётчик не меняется', async () => {
      // Админский GET заодно создаёт строку настроек, с которой потом сравниваем.
      await request(app).get('/api/admin/settings').set(authHeaders(admin))
      const before = await AppDataSource.getRepository(SiteSettings).findOneByOrFail({
        id: 'default',
      })
      expectForbidden(await request(app).get('/api/admin/settings').set(authHeaders(editor)))

      const res = await request(app)
        .patch('/api/admin/settings')
        .set(authHeaders(editor))
        .send({ metrikaId: '999999' })

      expectForbidden(res)
      const after = await AppDataSource.getRepository(SiteSettings).findOneByOrFail({
        id: 'default',
      })
      expect(after.metrikaId).toBe(before.metrikaId)
    })

    it('admin читает и меняет настройки', async () => {
      const get = await request(app).get('/api/admin/settings').set(authHeaders(admin))
      const patch = await request(app)
        .patch('/api/admin/settings')
        .set(authHeaders(admin))
        .send({ metrikaId: '123456' })

      expect(get.status).toBe(200)
      expect(patch.status).toBe(200)
      expect(patch.body.data.metrikaId).toBe('123456')
    })
  })

  describe('контент остаётся доступен редактору', () => {
    it.each([
      '/api/admin/products',
      '/api/admin/categories',
      '/api/admin/pages',
      '/api/admin/blog',
      '/api/admin/media',
      '/api/admin/redirects',
    ])('GET %s — 200', async (path) => {
      const res = await request(app).get(path).set(authHeaders(editor))

      expect(res.status).toBe(200)
    })

    it('ревизии доступны редактору', async () => {
      const res = await request(app)
        .get('/api/admin/revisions/entity/page/00000000-0000-4000-8000-000000000000')
        .set(authHeaders(editor))

      expect(res.status).toBe(200)
    })

    it('редактор по-прежнему может создавать и править контент (с CSRF)', async () => {
      const created = await request(app)
        .post('/api/admin/pages')
        .set(authHeaders(editor))
        .send({ slug: 'role-check-page', title: 'Проверка ролей' })

      expect(created.status).toBe(201)

      const updated = await request(app)
        .patch(`/api/admin/pages/${created.body.data.id}`)
        .set(authHeaders(editor))
        .send({ title: 'Проверка ролей, правка' })

      expect(updated.status).toBe(200)
      expect(updated.body.data.title).toBe('Проверка ролей, правка')
    })
  })

  describe('как проверяется роль', () => {
    it('без входа — 401 (а не 403): сначала вход, потом права', async () => {
      const res = await request(app).get('/api/admin/orders')

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('auth_required')
    })

    it('роль берётся из базы на каждом запросе: понижение действует на уже открытую сессию', async () => {
      expect((await request(app).get('/api/admin/orders').set(authHeaders(admin))).status).toBe(200)

      await AppDataSource.getRepository(AdminUser).update(
        { email: TEST_ADMIN_EMAIL },
        { role: 'editor' },
      )

      expectForbidden(await request(app).get('/api/admin/orders').set(authHeaders(admin)))
    })

    it.each(['Admin', 'ADMIN', 'superuser', ''])(
      'роль «%s» не считается admin: доступ закрыт',
      async (role) => {
        await AppDataSource.query('UPDATE admin_users SET role = $1 WHERE email = $2', [
          role,
          TEST_ADMIN_EMAIL,
        ])

        expectForbidden(await request(app).get('/api/admin/orders').set(authHeaders(admin)))
      },
    )

    it('/api/auth/me по-прежнему отдаёт роль, чтобы интерфейс мог скрыть разделы', async () => {
      const res = await request(app).get('/api/auth/me').set(authHeaders(editor))

      expect(res.status).toBe(200)
      expect(res.body.data.role).toBe('editor')
    })
  })
})

// Подстраховка миграции: после выкатки проверок в админке должен остаться хотя
// бы один admin, иначе владелец, заведённый с ролью по умолчанию (editor),
// потерял бы заказы и настройки.
describe('миграция EnsureOneAdminUser', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE admin_sessions, admin_users RESTART IDENTITY CASCADE')
  })

  async function addUser(email: string, role: 'admin' | 'editor', createdAt: string) {
    await AppDataSource.query(
      `INSERT INTO admin_users (email, password_hash, role, created_at) VALUES ($1, 'x', $2, $3)`,
      [email, role, createdAt],
    )
  }
  async function roles(): Promise<Record<string, string>> {
    const rows: Array<{ email: string; role: string }> = await AppDataSource.query(
      'SELECT email, role FROM admin_users ORDER BY email',
    )
    return Object.fromEntries(rows.map((r) => [r.email, r.role]))
  }
  async function runUp() {
    const runner = AppDataSource.createQueryRunner()
    try {
      await new EnsureOneAdminUser1790810000000().up(runner)
    } finally {
      await runner.release()
    }
  }

  it('нет ни одного admin: самый старый пользователь становится admin, остальные не трогаются', async () => {
    await addUser('second@x.ru', 'editor', '2026-02-01T00:00:00Z')
    await addUser('first@x.ru', 'editor', '2026-01-01T00:00:00Z')
    await addUser('third@x.ru', 'editor', '2026-03-01T00:00:00Z')

    await runUp()

    expect(await roles()).toEqual({
      'first@x.ru': 'admin',
      'second@x.ru': 'editor',
      'third@x.ru': 'editor',
    })
  })

  it('admin уже есть: роли не меняются', async () => {
    await addUser('old@x.ru', 'editor', '2026-01-01T00:00:00Z')
    await addUser('boss@x.ru', 'admin', '2026-02-01T00:00:00Z')

    await runUp()

    expect(await roles()).toEqual({ 'boss@x.ru': 'admin', 'old@x.ru': 'editor' })
  })

  it('пользователей нет: ничего не делает и не падает', async () => {
    await expect(runUp()).resolves.toBeUndefined()
    expect(await roles()).toEqual({})
  })

  it('повторный запуск ничего не меняет', async () => {
    await addUser('first@x.ru', 'editor', '2026-01-01T00:00:00Z')
    await addUser('second@x.ru', 'editor', '2026-02-01T00:00:00Z')

    await runUp()
    await runUp()

    expect(await roles()).toEqual({ 'first@x.ru': 'admin', 'second@x.ru': 'editor' })
  })
})
