import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { AdminUser } from './AdminUser.js'

describe('AdminUser entity', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize()
    }
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy()
    }
  })

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE TABLE "admin_users" RESTART IDENTITY CASCADE')
  })

  it('persists and retrieves an admin user round-trip', async () => {
    const repo = AppDataSource.getRepository(AdminUser)
    const created = repo.create({
      email: 'admin@ximi4ka.ru',
      passwordHash: '$2b$10$fakehash',
      role: 'admin',
    })
    const saved = await repo.save(created)
    expect(saved.id).toBeTruthy()

    const found = await repo.findOneByOrFail({ id: saved.id })
    expect(found.email).toBe('admin@ximi4ka.ru')
    expect(found.passwordHash).toBe('$2b$10$fakehash')
    expect(found.role).toBe('admin')
  })
})
