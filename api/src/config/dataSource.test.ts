import 'reflect-metadata'
import { describe, it, expect, afterAll } from 'vitest'
import { AppDataSource } from './dataSource.js'
import type { OrderStatus } from '@ximi4ka-shop/shared'

describe('AppDataSource', () => {
  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy()
    }
  })

  it('connects to the local Postgres and runs a trivial query', async () => {
    await AppDataSource.initialize()
    expect(AppDataSource.isInitialized).toBe(true)
    const result = await AppDataSource.query('SELECT 1 as ok')
    expect(Number(result[0].ok)).toBe(1)
  })

  it('has shared types wired up', () => {
    const status: OrderStatus = 'pending'
    expect(status).toBe('pending')
  })
})
