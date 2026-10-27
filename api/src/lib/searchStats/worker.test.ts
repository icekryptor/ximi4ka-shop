import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import type { StatQuery, StatRow } from './metrikaReports.js'
import {
  runMetrikaSyncIfDue,
  searchStatsConfigured,
  startSearchStatsWorker,
  syncDue,
  syncWindow,
} from './worker.js'

const HOUR = 60 * 60 * 1000
const PROD = {
  NODE_ENV: 'production',
  SEARCH_STATS_SYNC_ENABLED: 'true',
  YANDEX_STATS_OAUTH_TOKEN: 't',
}

describe('расписание', () => {
  it('syncDue: нет успеха — пора; успех 19 ч назад — рано; 20 ч — пора', () => {
    const now = new Date('2026-10-28T04:00:00Z')
    expect(syncDue(null, now)).toBe(true)
    expect(syncDue(new Date(now.getTime() - 19 * HOUR), now)).toBe(false)
    expect(syncDue(new Date(now.getTime() - 20 * HOUR), now)).toBe(true)
  })

  it('syncWindow: обычный запуск — 7 дней до вчера, первый — с начала истории', () => {
    expect(syncWindow('2026-10-28', false)).toEqual({ from: '2026-10-21', to: '2026-10-27' })
    expect(syncWindow('2026-10-28', true)).toEqual({ from: '2026-10-01', to: '2026-10-27' })
  })

  it('searchStatsConfigured: нужны и флаг, и токен', () => {
    expect(searchStatsConfigured({ SEARCH_STATS_SYNC_ENABLED: 'true' })).toBe(false)
    expect(searchStatsConfigured({ YANDEX_STATS_OAUTH_TOKEN: 't' })).toBe(false)
    expect(searchStatsConfigured(PROD)).toBe(true)
  })

  it.each([
    ['без флага', { NODE_ENV: 'production', YANDEX_STATS_OAUTH_TOKEN: 't' }],
    ['без токена', { NODE_ENV: 'production', SEARCH_STATS_SYNC_ENABLED: 'true' }],
    ['вне production', { ...PROD, NODE_ENV: 'development' }],
  ])('startSearchStatsWorker %s — null', (_label, env) => {
    expect(startSearchStatsWorker({ env, client: { data: vi.fn() } })).toBeNull()
  })
})

describe('runMetrikaSyncIfDue', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE search_stats_sync_runs, traffic_sources_daily, landing_pages_daily',
    )
  })

  it('первый запуск берёт историю с 2026-10-01 и пишет журнал', async () => {
    const client = { data: vi.fn(async (_c: string, _q: StatQuery): Promise<StatRow[]> => []) }
    const res = await runMetrikaSyncIfDue({
      client,
      counterId: '1',
      now: new Date('2026-10-28T04:00:00Z'),
    })
    expect(res).toBe('ok')
    expect(client.data.mock.calls[0][1]).toMatchObject({ date1: '2026-10-01', date2: '2026-10-27' })
  })

  it('недавний успех — пропуск без запросов к Метрике', async () => {
    await AppDataSource.query(
      `INSERT INTO search_stats_sync_runs (source, status, finished_at) VALUES ('metrika', 'ok', now())`,
    )
    const client = { data: vi.fn(async (_c: string, _q: StatQuery): Promise<StatRow[]> => []) }
    expect(await runMetrikaSyncIfDue({ client, counterId: '1', now: new Date() })).toBe('skipped')
    expect(client.data).not.toHaveBeenCalled()
  })

  it('ошибка Метрики — error в журнале, исключение не вылетает', async () => {
    const client = { data: vi.fn(async () => Promise.reject(new Error('сеть'))) }
    expect(await runMetrikaSyncIfDue({ client, counterId: '1', now: new Date() })).toBe('error')
    const [run] = (await AppDataSource.query(
      `SELECT status, error FROM search_stats_sync_runs`,
    )) as Array<{
      status: string
      error: string
    }>
    expect(run).toEqual({ status: 'error', error: 'сеть' })
  })
})
