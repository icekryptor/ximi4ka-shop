import { describe, it, expect, vi } from 'vitest'
import { MetrikaError } from '../metrika/client.js'
import { PROBE_VARIANTS, runMetrikaProbe, runWebmasterProbe } from './probe.js'

const SECRET = 'y0_FAKE'

describe('runMetrikaProbe', () => {
  it('по каждому варианту: принят ли, сколько визитов, первые строки; ошибка не прерывает остальные', async () => {
    const data = vi.fn(async (_c: string, q: { dimensions: string[] }) => {
      if (q.dimensions.some((d) => d.includes('lastsign')))
        throw new MetrikaError(400, 'Metrika 400: wrong dimension')
      return [
        {
          dimensions: [
            { id: null, name: '2026-10-27' },
            { id: 'organic', name: 'Поиск' },
          ],
          metrics: [7],
        },
      ]
    })
    const results = await runMetrikaProbe({ data }, '1', '2026-10-27')
    expect(results).toHaveLength(PROBE_VARIANTS.length)
    const failed = results.find((r) => r.label === 'lastsign: источник')
    expect(failed).toMatchObject({ ok: false, error: 'Metrika 400: wrong dimension' })
    const passed = results.find((r) => r.ok)
    expect(passed).toMatchObject({ rows: 1, visits: 7 })
    expect(passed?.sample[0]).toEqual([
      { id: null, name: '2026-10-27' },
      { id: 'organic', name: 'Поиск' },
    ])
  })
})

describe('runWebmasterProbe', () => {
  it('идёт по шагам с найденными user_id и host_id; тело обрезано, токена в выводе нет', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/v4/user')) return new Response(JSON.stringify({ user_id: 5 }))
      if (url.endsWith('/v4/user/5/hosts')) {
        return new Response(
          JSON.stringify({
            hosts: [{ host_id: 'https:ximi4ka.ru:443', ascii_host_url: 'https://ximi4ka.ru/' }],
          }),
        )
      }
      return new Response('x'.repeat(5000), { status: 200 })
    })
    const steps = await runWebmasterProbe(fetchMock, SECRET, '2026-10-28')
    expect(steps.map((s) => s.label)).toEqual([
      'user',
      'hosts',
      'search-queries/all/history за 550 дней',
      'query-analytics/list',
      'indexing/history за 400 дней',
      'search-urls/in-search/history за 400 дней',
      'sqi-history',
    ])
    const urls = fetchMock.mock.calls.map((c) => c[0] as string)
    expect(urls[2]).toContain(
      '/v4/user/5/hosts/https%3Aximi4ka.ru%3A443/search-queries/all/history',
    )
    expect(urls[2]).toContain('date_from=2025-04-26')
    for (const s of steps) {
      expect(s.body.length).toBeLessThanOrEqual(1500)
      expect(s.body).not.toContain(SECRET)
    }
  })

  it('нет хоста ximi4ka.ru — останавливается с понятным шагом', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/v4/user')
        ? new Response(JSON.stringify({ user_id: 5 }))
        : new Response(JSON.stringify({ hosts: [] })),
    )
    const steps = await runWebmasterProbe(fetchMock, SECRET, '2026-10-28')
    expect(steps.at(-1)).toMatchObject({ label: 'hosts', status: 200 })
    expect(steps.at(-1)?.note).toMatch(/ximi4ka\.ru не найден/)
  })
})
