import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { BlogPost } from '@ximi4ka-shop/shared'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    listBlogPosts: vi.fn(),
    getBlogPostBySlug: vi.fn(),
  }
})

import BlogPostPage, {
  revalidate,
  dynamicParams,
  generateStaticParams,
  generateMetadata,
} from './page'
import { getBlogPostBySlug, listBlogPosts } from '@/lib/api'

function makePost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: 'bp1',
    slug: 'pochemu-plamya-sinee',
    title: 'Почему пламя синее',
    excerpt: 'Разбираем химию горения.',
    coverImageUrl: null,
    rubric: 'Опыты',
    blocks: [{ type: 'paragraph', html: '<p>Пламя окрашивают ионы меди.</p>' }],
    metaTitle: null,
    metaDescription: null,
    ogImage: null,
    canonicalUrl: null,
    noindex: false,
    translations: {},
    isPublished: true,
    publishedAt: '2026-06-01T00:00:00.000Z',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    ...overrides,
  }
}

const props = {
  params: Promise.resolve({ locale: 'ru', slug: 'pochemu-plamya-sinee' }),
}

describe('BlogPostPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('is an async Server Component', () => {
    expect(BlogPostPage.constructor.name).toBe('AsyncFunction')
  })

  it('enables ISR with a 60-second revalidate window', () => {
    expect(revalidate).toBe(60)
  })

  it('allows on-demand rendering of new posts (dynamicParams)', () => {
    expect(dynamicParams).toBe(true)
  })

  it('emits (locale, slug) pairs from the published listing', async () => {
    vi.mocked(listBlogPosts).mockResolvedValue({
      data: [makePost(), makePost({ id: 'bp2', slug: 'kristally-doma' })],
      pagination: { limit: 100, offset: 0, page: 1, total: 2 },
    })
    const params = await generateStaticParams()
    expect(params).toContainEqual({ locale: 'ru', slug: 'pochemu-plamya-sinee' })
    expect(params).toContainEqual({ locale: 'en', slug: 'kristally-doma' })
  })

  it('returns an empty list when the API is offline', async () => {
    vi.mocked(listBlogPosts).mockRejectedValue(new Error('offline'))
    const params = await generateStaticParams()
    expect(params).toEqual([])
  })

  describe('generateMetadata', () => {
    it('builds title/canonical/og from the post', async () => {
      vi.mocked(getBlogPostBySlug).mockResolvedValue(
        makePost({ coverImageUrl: '/uploads/blog/flame.jpg' }),
      )
      const meta = await generateMetadata(props)
      expect(meta.title).toBe('Почему пламя синее')
      expect(meta.description).toBe('Разбираем химию горения.')
      expect(meta.alternates?.canonical).toBe(
        'https://new.ximi4ka.ru/blog/pochemu-plamya-sinee',
      )
      // ogImage falls back to the cover when no explicit ogImage is set.
      expect(JSON.stringify(meta.openGraph)).toContain('/uploads/blog/flame.jpg')
    })

    it('prefers metaTitle over title', async () => {
      vi.mocked(getBlogPostBySlug).mockResolvedValue(
        makePost({ metaTitle: 'SEO заголовок' }),
      )
      const meta = await generateMetadata(props)
      expect(meta.title).toBe('SEO заголовок')
    })

    it('degrades to a generic title when the API fails', async () => {
      vi.mocked(getBlogPostBySlug).mockRejectedValue(new Error('down'))
      const meta = await generateMetadata(props)
      expect(meta.title).toBe('Статья — Ximi4ka')
    })
  })

  describe('render', () => {
    it('renders title, rubric, date and block content', async () => {
      vi.mocked(getBlogPostBySlug).mockResolvedValue(makePost())

      render(await BlogPostPage(props))

      expect(
        screen.getByRole('heading', { level: 1, name: 'Почему пламя синее' }),
      ).toBeInTheDocument()
      expect(screen.getByText(/Опыты/)).toBeInTheDocument()
      expect(screen.getByText('1 июня 2026')).toBeInTheDocument()
      expect(
        screen.getByText('Пламя окрашивают ионы меди.'),
      ).toBeInTheDocument()
    })

    it('emits Article JSON-LD with publishedAt and BreadcrumbList with Блог', async () => {
      vi.mocked(getBlogPostBySlug).mockResolvedValue(makePost())

      const { container } = render(await BlogPostPage(props))
      const data = Array.from(
        container.querySelectorAll('script[type="application/ld+json"]'),
      ).map((s) => JSON.parse(s.textContent ?? '{}'))

      const article = data.find((d) => d['@type'] === 'Article')
      expect(article).toMatchObject({
        headline: 'Почему пламя синее',
        datePublished: '2026-06-01T00:00:00.000Z',
        dateModified: '2026-06-02T00:00:00.000Z',
      })

      const breadcrumb = data.find((d) => d['@type'] === 'BreadcrumbList')
      expect(breadcrumb.itemListElement).toHaveLength(3)
      expect(breadcrumb.itemListElement[1]).toMatchObject({
        name: 'Блог',
        item: 'https://new.ximi4ka.ru/blog',
      })
      expect(breadcrumb.itemListElement[2]).toMatchObject({
        name: 'Почему пламя синее',
        item: 'https://new.ximi4ka.ru/blog/pochemu-plamya-sinee',
      })
    })

    it('renders the cover image when set', async () => {
      vi.mocked(getBlogPostBySlug).mockResolvedValue(
        makePost({ coverImageUrl: '/uploads/blog/flame.jpg' }),
      )

      const { container } = render(await BlogPostPage(props))
      const img = container.querySelector('img')
      expect(img).not.toBeNull()
      expect(img).toHaveAttribute('alt', 'Почему пламя синее')
    })

    it('omits the cover block when there is no cover', async () => {
      vi.mocked(getBlogPostBySlug).mockResolvedValue(makePost())

      const { container } = render(await BlogPostPage(props))
      expect(container.querySelector('img')).toBeNull()
    })
  })
})
