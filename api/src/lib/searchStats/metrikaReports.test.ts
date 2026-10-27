import { describe, it, expect, vi } from 'vitest'
import { RateLimitError } from '../notifications/rateLimit.js'
import { MetrikaError } from '../metrika/client.js'
import {
  MetrikaReportsClient,
  fetchLandingDays,
  fetchSourceDays,
  normalizePath,
  type StatRow,
} from './metrikaReports.js'

const SECRET = 'y0_FAKE_STATS_TOKEN'
const COUNTER = '113445304'

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function apiRow(dims: Array<[string | null, string | null] | null>, metrics: number[]) {
  return { dimensions: dims.map((d) => (d ? { id: d[0], name: d[1] } : null)), metrics }
}

function row(dims: Array<[string | null, string | null]>, metrics: number[]): StatRow {
  return { dimensions: dims.map(([id, name]) => ({ id, name })), metrics }
}

const QUERY = {
  dimensions: ['ym:s:date', 'ym:s:lastsignTrafficSource'],
  metrics: ['ym:s:visits'],
  date1: '2026-10-20',
  date2: '2026-10-26',
}

describe('MetrikaReportsClient.data', () => {
  it('GET /stat/v1/data с полной точностью, московским поясом и заголовком OAuth', async () => {
    const fetchMock = vi.fn(async () => json({ data: [], total_rows: 0, sampled: false }))
    const client = new MetrikaReportsClient({ token: SECRET, fetch: fetchMock })

    await client.data(COUNTER, { ...QUERY, filters: "ym:s:lastsignTrafficSource=='organic'" })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://api-metrika.yandex.net/stat/v1/data')
    expect(u.searchParams.get('ids')).toBe(COUNTER)
    expect(u.searchParams.get('dimensions')).toBe('ym:s:date,ym:s:lastsignTrafficSource')
    expect(u.searchParams.get('accuracy')).toBe('full')
    expect(u.searchParams.get('timezone')).toBe('+03:00')
    expect(u.searchParams.get('limit')).toBe('100000')
    expect(u.searchParams.get('offset')).toBe('1')
    expect(u.searchParams.get('filters')).toBe("ym:s:lastsignTrafficSource=='organic'")
    expect(u.searchParams.has('attribution')).toBe(false)
    expect((init.headers as Record<string, string>).Authorization).toBe(`OAuth ${SECRET}`)
  })

  it('разбирает строки; пустое измерение — id и name null', async () => {
    const fetchMock = vi.fn(async () =>
      json({
        data: [apiRow([[null, '2026-10-20'], null], [12, 10, 25.5, 1.8])],
        total_rows: 1,
        sampled: false,
      }),
    )
    const client = new MetrikaReportsClient({ token: SECRET, fetch: fetchMock })
    const rows = await client.data(COUNTER, QUERY)
    expect(rows).toEqual([
      {
        dimensions: [
          { id: null, name: '2026-10-20' },
          { id: null, name: null },
        ],
        metrics: [12, 10, 25.5, 1.8],
      },
    ])
  })

  it('листает страницы: offset 1-based, пока не набрано total_rows', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({ data: [apiRow([['a', 'a']], [1]), apiRow([['b', 'b']], [2])], total_rows: 3 }),
      )
      .mockResolvedValueOnce(json({ data: [apiRow([['c', 'c']], [3])], total_rows: 3 }))
    const client = new MetrikaReportsClient({ token: SECRET, fetch: fetchMock, pageSize: 2 })

    const rows = await client.data(COUNTER, QUERY)

    expect(rows.map((r) => r.dimensions[0].id)).toEqual(['a', 'b', 'c'])
    const second = new URL((fetchMock.mock.calls[1] as unknown as [string])[0])
    expect(second.searchParams.get('offset')).toBe('3')
  })

  it('сэмплированный ответ — ошибка', async () => {
    const client = new MetrikaReportsClient({
      token: SECRET,
      fetch: async () => json({ data: [], total_rows: 0, sampled: true }),
    })
    await expect(client.data(COUNTER, QUERY)).rejects.toThrow(/сэмплирован/)
  })

  it.each([429, 420])('%i — RateLimitError с Retry-After', async (status) => {
    const client = new MetrikaReportsClient({
      token: SECRET,
      fetch: async () => json({ errors: [] }, status, { 'retry-after': '5' }),
    })
    const err = await client.data(COUNTER, QUERY).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RateLimitError)
    expect((err as RateLimitError).retryAfterMs).toBe(5000)
  })

  it('403 — MetrikaError с кодом, тело обрезано, токена в тексте нет', async () => {
    const client = new MetrikaReportsClient({
      token: SECRET,
      fetch: async () => json({ message: 'x'.repeat(1000) }, 403),
    })
    const err = (await client.data(COUNTER, QUERY).catch((e: unknown) => e)) as MetrikaError
    expect(err).toBeInstanceOf(MetrikaError)
    expect(err.status).toBe(403)
    expect(err.message.length).toBeLessThan(330)
    expect(err.message).not.toContain(SECRET)
  })

  it('fromEnv: без токена — null, с токеном — клиент', () => {
    expect(MetrikaReportsClient.fromEnv({})).toBeNull()
    expect(MetrikaReportsClient.fromEnv({ YANDEX_STATS_OAUTH_TOKEN: ' t ' })).toBeInstanceOf(
      MetrikaReportsClient,
    )
  })
})

describe('fetchSourceDays', () => {
  it('итоги по источникам с search_engine "" и поисковики органики отдельным запросом', async () => {
    const data = vi
      .fn()
      .mockResolvedValueOnce([
        row(
          [
            [null, '2026-10-20'],
            ['organic', 'Переходы из поисковых систем'],
          ],
          [30, 25, 20, 2],
        ),
        row(
          [
            [null, '2026-10-20'],
            ['direct', 'Прямые заходы'],
          ],
          [10, 9, 40, 1.5],
        ),
      ])
      .mockResolvedValueOnce([
        row(
          [
            [null, '2026-10-20'],
            ['yandex', 'Яндекс'],
          ],
          [20, 17, 18, 2.1],
        ),
        row(
          [
            [null, '2026-10-20'],
            [null, null],
          ],
          [10, 8, 22, 1.9],
        ),
      ])

    const rows = await fetchSourceDays({ data }, COUNTER, '2026-10-20', '2026-10-20')

    expect(data.mock.calls[1][1].filters).toBe("ym:s:lastsignTrafficSource=='organic'")
    expect(rows).toEqual([
      {
        day: '2026-10-20',
        source: 'organic',
        searchEngine: '',
        visits: 30,
        users: 25,
        bounceRate: 20,
        pageDepth: 2,
      },
      {
        day: '2026-10-20',
        source: 'direct',
        searchEngine: '',
        visits: 10,
        users: 9,
        bounceRate: 40,
        pageDepth: 1.5,
      },
      {
        day: '2026-10-20',
        source: 'organic',
        searchEngine: 'yandex',
        visits: 20,
        users: 17,
        bounceRate: 18,
        pageDepth: 2.1,
      },
      {
        day: '2026-10-20',
        source: 'organic',
        searchEngine: 'undefined',
        visits: 10,
        users: 8,
        bounceRate: 22,
        pageDepth: 1.9,
      },
    ])
  })

  it('строку с некорректным днём пропускает', async () => {
    const data = vi
      .fn()
      .mockResolvedValueOnce([
        row(
          [
            [null, null],
            ['direct', 'Прямые'],
          ],
          [1, 1, 0, 1],
        ),
      ])
      .mockResolvedValueOnce([])
    expect(await fetchSourceDays({ data }, COUNTER, '2026-10-20', '2026-10-20')).toEqual([])
  })
})

describe('fetchLandingDays и normalizePath', () => {
  it('путь из name, источник из id', async () => {
    const data = vi.fn().mockResolvedValueOnce([
      row(
        [
          [null, '2026-10-20'],
          [null, '/catalog'],
          ['organic', 'Поиск'],
        ],
        [5, 5, 0, 3],
      ),
      row(
        [
          [null, '2026-10-20'],
          [null, null],
          ['direct', 'Прямые'],
        ],
        [2, 2, 50, 1],
      ),
    ])
    const rows = await fetchLandingDays({ data }, COUNTER, '2026-10-20', '2026-10-20')
    expect(rows.map((r) => [r.path, r.source, r.visits])).toEqual([
      ['/catalog', 'organic', 5],
      ['/', 'direct', 2],
    ])
  })

  it('normalizePath: пусто → "/", без слэша → со слэшем, длинный режется до 300', () => {
    expect(normalizePath(null)).toBe('/')
    expect(normalizePath('  ')).toBe('/')
    expect(normalizePath('catalog')).toBe('/catalog')
    expect(normalizePath('/' + 'a'.repeat(400))).toHaveLength(300)
  })
})
