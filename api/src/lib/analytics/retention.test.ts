import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import {
  WEB_VITAL_RETENTION_DAYS,
  purgeOldWebVitals,
  startWebVitalsRetentionJob,
} from './retention.js'

const VISITOR = '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b'
const NOW = new Date('2026-10-23T12:00:00Z')

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

async function seed(type: string, occurredAt: string, path: string): Promise<void> {
  await AppDataSource.query(
    'INSERT INTO analytics_events (type, visitor_id, path, occurred_at) VALUES ($1, $2, $3, $4)',
    [type, VISITOR, path, occurredAt],
  )
}

describe('purgeOldWebVitals', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE analytics_events')
  })

  it('удаляет web_vital старше 90 дней, цели и свежие замеры не трогает', async () => {
    expect(WEB_VITAL_RETENTION_DAYS).toBe(90)
    await seed('web_vital', daysAgo(91), '/old-vital')
    await seed('web_vital', daysAgo(90.01), '/edge-vital')
    await seed('web_vital', daysAgo(89), '/fresh-vital')
    await seed('add_to_cart', daysAgo(400), '/old-goal')

    expect(await purgeOldWebVitals(NOW)).toBe(2)

    const left = (await AppDataSource.query(
      'SELECT type, path FROM analytics_events ORDER BY path',
    )) as Array<{ type: string; path: string }>
    expect(left).toEqual([
      { type: 'web_vital', path: '/fresh-vital' },
      { type: 'add_to_cart', path: '/old-goal' },
    ])
  })

  it('пустая таблица — 0', async () => {
    expect(await purgeOldWebVitals(NOW)).toBe(0)
  })
})

describe('startWebVitalsRetentionJob', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('чистит сразу при старте и затем раз в сутки, не держит процесс', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const purge = vi.fn(() => Promise.resolve(0))
    const timer = startWebVitalsRetentionJob({ purge })
    expect(purge).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(24 * 60 * 60 * 1000)
    expect(purge).toHaveBeenCalledTimes(2)
    expect(timer.hasRef()).toBe(false)
    clearInterval(timer)
  })

  it('сбой чистки не роняет процесс', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const purge = vi.fn(() => Promise.reject(new Error('db down')))
    const timer = startWebVitalsRetentionJob({ purge })
    await vi.waitFor(() => expect(error).toHaveBeenCalled())
    clearInterval(timer)
    error.mockRestore()
  })
})
