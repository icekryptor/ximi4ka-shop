import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL

import { GET } from './route'

function mockApiText(body: string, init: { status?: number } = {}) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, init)))
}

describe('robots.txt route', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    if (ORIGINAL_SITE_URL != null) process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL
  })

  it('дописывает Sitemap, если в открытом robots.txt из БД его нет', async () => {
    mockApiText('User-agent: *\nAllow: /\nDisallow: /cart')
    const body = await (await GET()).text()
    expect(body).toBe(
      'User-agent: *\nAllow: /\nDisallow: /cart\nSitemap: https://new.ximi4ka.ru/sitemap.xml\n',
    )
  })

  it('берёт адрес карты из NEXT_PUBLIC_SITE_URL', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://ximi4ka.ru'
    mockApiText('User-agent: *\nAllow: /\n')
    const body = await (await GET()).text()
    expect(body).toContain('Sitemap: https://ximi4ka.ru/sitemap.xml')
  })

  it('не дублирует Sitemap, если строка уже есть (любой адрес, любой регистр)', async () => {
    const own = 'User-agent: *\nAllow: /\nsitemap: https://example.com/other.xml\n'
    mockApiText(own)
    expect(await (await GET()).text()).toBe(own)
  })

  it('не трогает закрытый режим: Disallow: / для User-agent: *', async () => {
    const closed = 'User-agent: *\nDisallow: /'
    mockApiText(closed)
    expect(await (await GET()).text()).toBe(closed)
  })

  it('закрытым считает и Disallow: / в группе с несколькими User-agent', async () => {
    const closed = 'User-agent: Yandex\nUser-agent: *\nDisallow: /\n'
    mockApiText(closed)
    expect(await (await GET()).text()).toBe(closed)
  })

  it('Disallow: /cart — не закрытый режим, Sitemap добавляется', async () => {
    mockApiText('User-agent: *\nDisallow: /cart\n')
    expect(await (await GET()).text()).toContain('Sitemap: https://new.ximi4ka.ru/sitemap.xml')
  })

  it('Disallow: / только для другого бота не закрывает сайт целиком', async () => {
    mockApiText('User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n')
    expect(await (await GET()).text()).toContain('Sitemap: https://new.ximi4ka.ru/sitemap.xml')
  })

  it('отдаёт fallback с Sitemap, если api ответил ошибкой', async () => {
    mockApiText('boom', { status: 500 })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(
      'User-agent: *\nAllow: /\nSitemap: https://new.ximi4ka.ru/sitemap.xml\n',
    )
  })

  it('отдаёт fallback с Sitemap, если api недоступен', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Sitemap: https://new.ximi4ka.ru/sitemap.xml')
  })

  it('отдаёт text/plain', async () => {
    mockApiText('User-agent: *\nAllow: /\n')
    expect((await GET()).headers.get('content-type')).toBe('text/plain; charset=utf-8')
  })
})
