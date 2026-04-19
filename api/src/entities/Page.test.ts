import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { Page } from './Page.js'

describe('Page entity', () => {
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
    await AppDataSource.query('TRUNCATE TABLE "pages" RESTART IDENTITY CASCADE')
  })

  it('persists and retrieves a page round-trip', async () => {
    const repo = AppDataSource.getRepository(Page)
    const created = repo.create({
      slug: 'about',
      title: 'About Us',
      blocks: [{ type: 'text', content: 'Hello' }],
      isPublished: true,
      noindex: false,
      translations: {},
    })
    const saved = await repo.save(created)
    expect(saved.id).toBeTruthy()

    const found = await repo.findOneByOrFail({ id: saved.id })
    expect(found.slug).toBe('about')
    expect(found.title).toBe('About Us')
    expect(found.isPublished).toBe(true)
    expect(Array.isArray(found.blocks)).toBe(true)
    expect(found.blocks).toHaveLength(1)
  })
})
