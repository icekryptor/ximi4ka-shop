import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { RateLimitError } from '../notifications/rateLimit.js'
import { MetrikaError } from '../metrika/client.js'
import { describeSyncError, lastSuccessAt, latestRuns, recordRun } from './runs.js'

describe('журнал синхронизаций', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE search_stats_sync_runs')
  })

  it('успешный запуск: status ok, число строк, lastSuccessAt', async () => {
    const r = await recordRun('metrika', async () => 42)
    expect(r).toEqual({ ok: true, rows: 42, error: null })
    expect(await lastSuccessAt('metrika')).toBeInstanceOf(Date)
    expect(await lastSuccessAt('webmaster')).toBeNull()
  })

  it('ошибка: status error с понятным текстом, исключение не пробрасывается', async () => {
    const r = await recordRun('metrika', async () => {
      throw new MetrikaError(401, 'Metrika 401: unauthorized')
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/перевыпустите YANDEX_STATS_OAUTH_TOKEN/)
    expect(await lastSuccessAt('metrika')).toBeNull()
  })

  it('latestRuns: последний запуск и последний успех по каждому источнику', async () => {
    await recordRun('metrika', async () => 1)
    await recordRun('metrika', async () => {
      throw new Error('сеть')
    })
    const runs = await latestRuns()
    expect(runs.map((r) => r.source)).toEqual(['metrika', 'webmaster'])
    expect(runs[0]).toMatchObject({ lastStatus: 'error', lastError: 'сеть' })
    expect(runs[0].lastSuccessAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(runs[1]).toEqual({
      source: 'webmaster',
      lastStartedAt: null,
      lastStatus: null,
      lastError: null,
      lastSuccessAt: null,
    })
  })
})

describe('describeSyncError', () => {
  it('переводит коды в действия владельца', () => {
    expect(describeSyncError(new RateLimitError('429', 1000))).toMatch(/лимит запросов/)
    expect(describeSyncError(new MetrikaError(403, 'x'))).toMatch(/metrika:read/)
    expect(describeSyncError(new Error('a'.repeat(1000)))).toHaveLength(300)
    expect(describeSyncError('строка')).toBe('Неизвестная ошибка')
  })
})
