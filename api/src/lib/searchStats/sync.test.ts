import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { RateLimitError } from '../notifications/rateLimit.js'
import type { StatRow } from './metrikaReports.js'
import { mergeRows, syncMetrika, withRateLimitRetry } from './sync.js'

function row(dims: Array<[string | null, string | null]>, metrics: number[]): StatRow {
  return { dimensions: dims.map(([id, name]) => ({ id, name })), metrics }
}

// Фейковый клиент: по порядку вызовов — итоги источников, поисковики, страницы входа.
function fakeClient(visits: number, day = '2026-10-20') {
  return {
    data: vi
      .fn()
      .mockResolvedValueOnce([
        row(
          [
            [null, day],
            ['organic', 'Поиск'],
          ],
          [visits, visits, 10, 2],
        ),
      ])
      .mockResolvedValueOnce([
        row(
          [
            [null, day],
            ['yandex', 'Яндекс'],
          ],
          [visits, visits, 10, 2],
        ),
      ])
      .mockResolvedValueOnce([
        row(
          [
            [null, day],
            [null, '/'],
            ['organic', 'Поиск'],
          ],
          [visits, visits, 10, 2],
        ),
      ]),
  }
}

const RANGE = { from: '2026-10-20', to: '2026-10-26' }

async function sourceRows() {
  return (await AppDataSource.query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, source, search_engine, visits
       FROM traffic_sources_daily ORDER BY day, source, search_engine`,
  )) as Array<{ day: string; source: string; search_engine: string; visits: number }>
}

describe('mergeRows', () => {
  it('складывает визиты и посетителей, отказы и глубину усредняет по визитам', () => {
    const merged = mergeRows(
      [
        {
          day: 'd',
          path: '/',
          source: 'organic',
          visits: 10,
          users: 8,
          bounceRate: 20,
          pageDepth: 2,
        },
        {
          day: 'd',
          path: '/',
          source: 'organic',
          visits: 30,
          users: 25,
          bounceRate: 40,
          pageDepth: 1,
        },
      ],
      (r) => `${r.day}|${r.path}|${r.source}`,
    )
    expect(merged).toEqual([
      {
        day: 'd',
        path: '/',
        source: 'organic',
        visits: 40,
        users: 33,
        bounceRate: 35,
        pageDepth: 1.25,
      },
    ])
  })
})

describe('withRateLimitRetry', () => {
  it('ждёт Retry-After, но не больше 5 минут, и повторяет один раз', async () => {
    const sleep = vi.fn(async () => {})
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError('429', 10 * 60 * 1000))
      .mockResolvedValueOnce('ok')
    await expect(withRateLimitRetry(fn, sleep)).resolves.toBe('ok')
    expect(sleep).toHaveBeenCalledWith(5 * 60 * 1000)
  })

  it('второй отказ пробрасывает', async () => {
    const fn = vi.fn().mockRejectedValue(new RateLimitError('429', 1000))
    await expect(withRateLimitRetry(fn, async () => {})).rejects.toBeInstanceOf(RateLimitError)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('syncMetrika', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE traffic_sources_daily, landing_pages_daily')
  })

  it('пишет итоги, поисковики и страницы входа', async () => {
    const written = await syncMetrika(fakeClient(12), '113445304', RANGE)
    expect(written).toBe(3)
    expect(await sourceRows()).toEqual([
      { day: '2026-10-20', source: 'organic', search_engine: '', visits: 12 },
      { day: '2026-10-20', source: 'organic', search_engine: 'yandex', visits: 12 },
    ])
    const [landing] = (await AppDataSource.query(
      `SELECT path, source, visits FROM landing_pages_daily`,
    )) as Array<{ path: string; source: string; visits: number }>
    expect(landing).toEqual({ path: '/', source: 'organic', visits: 12 })
  })

  it('повторный запуск по тому же окну заменяет значения, а не удваивает; дни вне окна не трогает', async () => {
    await AppDataSource.query(
      `INSERT INTO traffic_sources_daily VALUES ('2026-10-01', 'direct', '', 5, 5, 0, 1)`,
    )
    await syncMetrika(fakeClient(12), '113445304', RANGE)
    await syncMetrika(fakeClient(20), '113445304', RANGE)
    expect(await sourceRows()).toEqual([
      { day: '2026-10-01', source: 'direct', search_engine: '', visits: 5 },
      { day: '2026-10-20', source: 'organic', search_engine: '', visits: 20 },
      { day: '2026-10-20', source: 'organic', search_engine: 'yandex', visits: 20 },
    ])
  })

  it('два сырых значения с одним ключом сливаются, транзакция не падает', async () => {
    const day = '2026-10-21'
    const client = {
      data: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          row(
            [
              [null, day],
              [null, null],
            ],
            [3, 3, 0, 1],
          ),
          row(
            [
              [null, day],
              ['undefined', 'Не определено'],
            ],
            [2, 2, 0, 1],
          ),
        ])
        .mockResolvedValueOnce([]),
    }
    await syncMetrika(client, '113445304', RANGE)
    expect(await sourceRows()).toEqual([
      { day, source: 'organic', search_engine: 'undefined', visits: 5 },
    ])
  })

  it('ошибка на страницах входа оставляет уже записанные источники и пробрасывается', async () => {
    const client = {
      data: vi
        .fn()
        .mockResolvedValueOnce([
          row(
            [
              [null, '2026-10-20'],
              ['direct', 'Прямые'],
            ],
            [4, 4, 0, 1],
          ),
        ])
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('boom')),
    }
    await expect(syncMetrika(client, '113445304', RANGE)).rejects.toThrow('boom')
    expect(await sourceRows()).toHaveLength(1)
  })
})
