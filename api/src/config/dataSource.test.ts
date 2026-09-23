import 'reflect-metadata'
import { describe, it, expect, afterAll } from 'vitest'
import { AppDataSource, resolveSslFor } from './dataSource.js'
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

describe('resolveSslFor', () => {
  it('disables TLS for localhost URLs with or without a user', () => {
    expect(resolveSslFor('postgres://localhost:5432/ximi4ka_shop_test')).toBe(false)
    expect(resolveSslFor('postgres://user@localhost:5432/ximi4ka_shop')).toBe(false)
    expect(resolveSslFor('postgres://user:pw@127.0.0.1:5432/db')).toBe(false)
  })

  it('disables TLS for docker-network hostnames (self-hosted Postgres)', () => {
    expect(resolveSslFor('postgres://ximishop_user:pw@db:5432/ximi4ka_shop')).toBe(false)
    expect(resolveSslFor('postgres://user:pw@supabase-db:5432/db')).toBe(false)
  })

  it('enables TLS for managed providers', () => {
    expect(resolveSslFor('postgres://u:p@ep-x.eu-central-1.aws.neon.tech:5432/db')).toEqual({
      rejectUnauthorized: false,
    })
    expect(resolveSslFor('postgres://u:p@containers-us-west-1.railway.app:5432/railway')).toEqual({
      rejectUnauthorized: false,
    })
  })

  it('lets DATABASE_SSL override the heuristic in both directions', () => {
    expect(resolveSslFor('postgres://u:p@db.example.com:5432/db', 'false')).toBe(false)
    expect(resolveSslFor('postgres://localhost:5432/db', 'true')).toEqual({
      rejectUnauthorized: false,
    })
  })
})

describe('migrations glob', () => {
  it('is module-relative and matches compiled .js as well as source .ts', async () => {
    const { readdirSync } = await import('node:fs')
    const { dirname, basename } = await import('node:path')

    const patterns = AppDataSource.options.migrations as string[]
    expect(patterns).toHaveLength(1)
    const [pattern] = patterns

    // Must not be cwd-relative: in the container the process starts from /app,
    // not from api/, and `src/` does not exist there at all.
    expect(pattern.startsWith('/')).toBe(true)
    // Must cover dist/*.js, otherwise `migration:run` finds nothing in prod.
    expect(basename(pattern)).toBe('*.{ts,js}')

    const files = readdirSync(dirname(pattern)).filter((f) => f.endsWith('.ts'))
    expect(files.length).toBeGreaterThanOrEqual(10)
  })
})
