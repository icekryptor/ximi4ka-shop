import request from 'supertest'
import argon2 from 'argon2'
import type { Express } from 'express'
import { AppDataSource } from '../config/dataSource.js'
import { AdminUser } from '../entities/AdminUser.js'

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
