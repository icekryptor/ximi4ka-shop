import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { Redirect } from './Redirect.js'

describe('Redirect entity', () => {
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
    await AppDataSource.query('TRUNCATE TABLE "redirects" RESTART IDENTITY CASCADE')
  })

  it('persists and retrieves a redirect round-trip', async () => {
    const repo = AppDataSource.getRepository(Redirect)
    const created = repo.create({
      fromPath: '/old-url',
      toPath: '/new-url',
      statusCode: 301,
      hitCount: 0,
    })
    const saved = await repo.save(created)
    expect(saved.id).toBeTruthy()

    const found = await repo.findOneByOrFail({ id: saved.id })
    expect(found.fromPath).toBe('/old-url')
    expect(found.toPath).toBe('/new-url')
    expect(found.statusCode).toBe(301)
    expect(found.hitCount).toBe(0)
  })
})
