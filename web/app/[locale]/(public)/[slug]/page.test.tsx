import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import CmsPage, { revalidate, generateStaticParams, generateMetadata } from './page'
import * as api from '@/lib/api'

describe('CmsPage ([slug] route)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is an async Server Component', () => {
    expect(CmsPage.constructor.name).toBe('AsyncFunction')
  })

  it('enables ISR with a 60-second revalidate window', () => {
    expect(revalidate).toBe(60)
  })

  it('exports generateStaticParams as a function', () => {
    expect(typeof generateStaticParams).toBe('function')
  })

  it('returns slugs the API serves, excluding home', async () => {
    vi.spyOn(api, 'getPage').mockImplementation(async (slug: string) => {
      return {
        id: slug,
        slug,
        title: slug,
        blocks: [],
        isPublished: true,
      } as unknown as Awaited<ReturnType<typeof api.getPage>>
    })
    const params = await generateStaticParams()
    const slugs = params.map((p) => p.slug)
    expect(slugs).toEqual(expect.arrayContaining(['o-nas', 'dostavka', 'kontakty']))
    expect(slugs).not.toContain('home')
  })

  it('filters out slugs whose API lookup fails', async () => {
    vi.spyOn(api, 'getPage').mockImplementation(async (slug: string) => {
      if (slug === 'dostavka') throw new Error('boom')
      return {
        id: slug,
        slug,
        title: slug,
        blocks: [],
        isPublished: true,
      } as unknown as Awaited<ReturnType<typeof api.getPage>>
    })
    const params = await generateStaticParams()
    const slugs = params.map((p) => p.slug)
    expect(slugs).toContain('o-nas')
    expect(slugs).toContain('kontakty')
    expect(slugs).not.toContain('dostavka')
  })

  it('returns an empty list when the API is offline', async () => {
    vi.spyOn(api, 'getPage').mockRejectedValue(new Error('offline'))
    const params = await generateStaticParams()
    expect(params).toEqual([])
  })

  describe('generateMetadata', () => {
    const params = Promise.resolve({ locale: 'ru', slug: 'o-nas' })
    const page = (overrides: Record<string, unknown> = {}) =>
      ({
        id: 'p1',
        slug: 'o-nas',
        title: 'О нас',
        blocks: [],
        isPublished: true,
        translations: {},
        ...overrides,
      }) as unknown as Awaited<ReturnType<typeof api.getPage>>

    it('добавляет бренд к title CMS-страницы', async () => {
      vi.spyOn(api, 'getPage').mockResolvedValue(page())
      const meta = await generateMetadata({ params })
      expect(meta.title).toBe('О нас — Химичка')
    })

    it('не дублирует бренд из metaTitle', async () => {
      vi.spyOn(api, 'getPage').mockResolvedValue(page({ metaTitle: 'О компании Химичка' }))
      const meta = await generateMetadata({ params })
      expect(meta.title).toBe('О компании Химичка')
    })

    it('для noindex-страницы не выдаёт canonical и hreflang', async () => {
      vi.spyOn(api, 'getPage').mockResolvedValue(page({ noindex: true }))
      const meta = await generateMetadata({ params })
      expect(meta.robots).toEqual({ index: false, follow: false })
      expect(meta.alternates).toBeUndefined()
      expect(meta.openGraph).toBeUndefined()
    })
  })
})
