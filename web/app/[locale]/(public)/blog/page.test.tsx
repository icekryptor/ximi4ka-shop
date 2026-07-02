import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { BlogPost } from '@ximi4ka-shop/shared'

vi.mock('@/lib/api', () => ({
  listBlogPosts: vi.fn(),
}))

import BlogListPage, {
  revalidate,
  generateStaticParams,
  generateMetadata,
} from './page'
import { listBlogPosts } from '@/lib/api'

function makePost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: 'bp1',
    slug: 'pochemu-plamya-sinee',
    title: 'Почему пламя синее',
    excerpt: 'Разбираем химию горения.',
    coverImageUrl: null,
    rubric: 'Опыты',
    blocks: [],
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
  params: Promise.resolve({ locale: 'ru' }),
  searchParams: Promise.resolve({}),
}

describe('BlogListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('is an async Server Component', () => {
    expect(BlogListPage.constructor.name).toBe('AsyncFunction')
  })

  it('enables ISR with a 60-second revalidate window', () => {
    expect(revalidate).toBe(60)
  })

  it('pre-renders both locales via generateStaticParams', () => {
    expect(generateStaticParams()).toEqual([
      { locale: 'ru' },
      { locale: 'en' },
    ])
  })

  it('emits the blog title + canonical via generateMetadata', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: 'ru' }),
    })
    expect(meta.title).toBe('Блог о химии — Ximi4ka')
    expect(meta.alternates?.canonical).toBe('https://new.ximi4ka.ru/blog')
  })

  it('renders post cards for every fetched post', async () => {
    vi.mocked(listBlogPosts).mockResolvedValue({
      data: [
        makePost(),
        makePost({ id: 'bp2', slug: 'kristally-doma', title: 'Кристаллы дома' }),
      ],
      pagination: { limit: 12, offset: 0, page: 1, total: 2 },
    })

    render(await BlogListPage(props))

    expect(screen.getByText('Почему пламя синее')).toBeInTheDocument()
    expect(screen.getByText('Кристаллы дома')).toBeInTheDocument()
    expect(listBlogPosts).toHaveBeenCalledWith({ page: 1, limit: 12 })
  })

  it('passes ?page= through to the API call', async () => {
    vi.mocked(listBlogPosts).mockResolvedValue({
      data: [],
      pagination: { limit: 12, offset: 24, page: 3, total: 0 },
    })

    render(
      await BlogListPage({
        params: Promise.resolve({ locale: 'ru' }),
        searchParams: Promise.resolve({ page: '3' }),
      }),
    )

    expect(listBlogPosts).toHaveBeenCalledWith({ page: 3, limit: 12 })
  })

  it('shows the empty state when there are no posts', async () => {
    vi.mocked(listBlogPosts).mockResolvedValue({
      data: [],
      pagination: { limit: 12, offset: 0, page: 1, total: 0 },
    })

    render(await BlogListPage(props))

    expect(screen.getByText('Пока нет статей')).toBeInTheDocument()
  })

  it('degrades to the empty state when the API is down', async () => {
    vi.mocked(listBlogPosts).mockRejectedValue(new Error('down'))

    render(await BlogListPage(props))

    expect(screen.getByText('Пока нет статей')).toBeInTheDocument()
  })

  it('renders numbered pagination when posts exceed one page', async () => {
    vi.mocked(listBlogPosts).mockResolvedValue({
      data: [makePost()],
      pagination: { limit: 12, offset: 0, page: 1, total: 30 },
    })

    render(await BlogListPage(props))

    const nav = screen.getByRole('navigation', { name: 'Пагинация' })
    expect(nav).toBeInTheDocument()
    expect(nav).toHaveTextContent('стр. 01 из 03')
  })

  it('emits BreadcrumbList JSON-LD', async () => {
    vi.mocked(listBlogPosts).mockResolvedValue({
      data: [],
      pagination: { limit: 12, offset: 0, page: 1, total: 0 },
    })

    const { container } = render(await BlogListPage(props))
    const scripts = Array.from(
      container.querySelectorAll('script[type="application/ld+json"]'),
    )
    const breadcrumb = scripts
      .map((s) => JSON.parse(s.textContent ?? '{}'))
      .find((d) => d['@type'] === 'BreadcrumbList')
    expect(breadcrumb).toBeDefined()
    expect(breadcrumb.itemListElement[1]).toMatchObject({
      name: 'Блог',
      item: 'https://new.ximi4ka.ru/blog',
    })
  })
})
