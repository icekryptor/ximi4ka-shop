import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { EntityRevision } from './EntityRevision.js'

describe('EntityRevision entity', () => {
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
    await AppDataSource.query(
      'TRUNCATE TABLE "entity_revisions" RESTART IDENTITY CASCADE'
    )
  })

  it('persists and retrieves a revision round-trip', async () => {
    const repo = AppDataSource.getRepository(EntityRevision)
    const entityId = '33333333-3333-3333-3333-333333333333'
    const created = repo.create({
      entityType: 'product',
      entityId,
      snapshot: { name: 'Old Name', priceRub: 999 },
      editedBy: null,
    })
    const saved = await repo.save(created)
    expect(saved.id).toBeTruthy()

    const found = await repo.findOneByOrFail({ id: saved.id })
    expect(found.entityType).toBe('product')
    expect(found.entityId).toBe(entityId)
    expect(found.snapshot).toEqual({ name: 'Old Name', priceRub: 999 })
    expect(found.editedBy).toBeNull()
  })
})
