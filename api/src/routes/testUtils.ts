import request from 'supertest'
import argon2 from 'argon2'
import type { Express } from 'express'
import { AppDataSource } from '../config/dataSource.js'
import { AdminUser } from '../entities/AdminUser.js'
import { Order } from '../entities/Order.js'
import { MemoryMailer, setMailerForTests } from '../lib/mail/mailer.js'

export const TEST_ADMIN_EMAIL = 'admin@test.local'
export const TEST_ADMIN_PASSWORD = 'test-password'

export interface AdminAuth {
  sessionCookie: string
  csrfToken: string
  csrfCookie: string
}

export async function loginAsAdmin(app: Express): Promise<AdminAuth> {
  const userRepo = AppDataSource.getRepository(AdminUser)
  let admin = await userRepo.findOneBy({ email: TEST_ADMIN_EMAIL })
  if (!admin) {
    admin = await userRepo.save(
      userRepo.create({
        email: TEST_ADMIN_EMAIL,
        passwordHash: await argon2.hash(TEST_ADMIN_PASSWORD),
        role: 'admin',
      }),
    )
  }

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD })

  if (res.status !== 200) {
    throw new Error(`loginAsAdmin: unexpected status ${res.status}: ${JSON.stringify(res.body)}`)
  }

  const raw = res.headers['set-cookie']
  const cookies = (Array.isArray(raw) ? raw : raw ? [raw] : []) as string[]
  const sessionCookie = cookies.find((c) => c.startsWith('ximi4ka_shop_session='))
  const csrfCookie = cookies.find((c) => c.startsWith('ximi4ka_shop_csrf='))
  if (!sessionCookie || !csrfCookie) {
    throw new Error('loginAsAdmin: missing session or csrf cookie in response')
  }
  const csrfTokenMatch = csrfCookie.match(/ximi4ka_shop_csrf=([^;]+)/)
  if (!csrfTokenMatch) throw new Error('loginAsAdmin: could not parse csrf token')
  const csrfToken = csrfTokenMatch[1]

  return { sessionCookie, csrfToken, csrfCookie }
}

export function authHeaders(auth: AdminAuth): Record<string, string> {
  return {
    Cookie: `${auth.sessionCookie}; ${auth.csrfCookie}`,
    'X-CSRF-Token': auth.csrfToken,
  }
}

// Гостевой заказ с минимальными полями — для тестов кабинета.
export async function seedOrder(overrides: Partial<Order> = {}): Promise<Order> {
  const repo = AppDataSource.getRepository(Order)
  return repo.save(
    repo.create({
      orderNumber: `XM-TEST-${Math.random().toString(36).slice(2, 10)}`,
      status: 'pending',
      customerName: 'Иван Иванов',
      customerPhone: '+79001234567',
      customerEmail: '',
      customerTelegram: null,
      deliveryAddress: {
        address: 'Москва, ул. Ленина, 1',
        comment: null,
        cityCode: 44,
        deliveryPointCode: 'MSK123',
      },
      deliveryMethod: 'cdek_pvz',
      subtotalRub: 1500,
      discountRub: 0,
      shippingRub: 0,
      totalRub: 1500,
      paymentProvider: 'manual',
      statusHistory: [],
      ...overrides,
    }),
  )
}

export async function resetAccountTables(): Promise<void> {
  await AppDataSource.query(
    'TRUNCATE customer_sessions, customer_email_codes, telegram_login_requests, order_items, orders, customers RESTART IDENTITY CASCADE',
  )
}

export interface CustomerAuth {
  cookie: string
  csrfToken: string
}

// Разбирает Set-Cookie ответа входа в «Cookie: …» для следующих запросов.
export function customerAuthFrom(setCookie: string[] | string | undefined): CustomerAuth {
  const list = ([] as string[]).concat(setCookie ?? [])
  const pick = (name: string) => list.find((c) => c.startsWith(`${name}=`))?.split(';')[0]
  const session = pick('ximi4ka_customer_session')
  const csrf = pick('ximi4ka_customer_csrf')
  if (!session || !csrf) throw new Error('customerAuthFrom: нет cookie сессии покупателя')
  return { cookie: `${session}; ${csrf}`, csrfToken: csrf.split('=')[1] }
}

export function customerHeaders(auth: CustomerAuth): Record<string, string> {
  return { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrfToken }
}

// Настоящий вход по коду: почта в памяти, код из письма.
export async function loginAsCustomer(
  app: Express,
  email = 'buyer@test.local',
  mailer = new MemoryMailer(),
): Promise<CustomerAuth> {
  setMailerForTests(mailer)
  const start = await request(app).post('/api/account/auth/email/start').send({ email })
  if (start.status !== 204) throw new Error(`loginAsCustomer: start ${start.status}`)
  const code = mailer.lastCodeFor(email)
  const res = await request(app).post('/api/account/auth/email/verify').send({ email, code })
  if (res.status !== 200) throw new Error(`loginAsCustomer: verify ${res.status}`)
  return customerAuthFrom(res.headers['set-cookie'])
}
