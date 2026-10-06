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
    authorName: null,
    authorJobTitle: null,
    authorBio: null,
    authorUrl: null,
    authorPhotoUrl: null,
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
      expect(meta.title).toBe('Почему пламя синее — Химичка')
      expect(meta.description).toBe('Разбираем химию горения.')
      expect(meta.alternates?.canonical).toBe('https://new.ximi4ka.ru/blog/pochemu-plamya-sinee')
      // ogImage falls back to the cover when no explicit ogImage is set.
      expect(JSON.stringify(meta.openGraph)).toContain('/uploads/blog/flame.jpg')
    })

    it('advertises the blog RSS feed via alternates.types', async () => {
      vi.mocked(getBlogPostBySlug).mockResolvedValue(makePost())
      const meta = await generateMetadata(props)
      expect(meta.alternates?.types).toEqual({
        'application/rss+xml': 'https://new.ximi4ka.ru/blog/rss.xml',
      })
    })

    it('prefers metaTitle over title', async () => {
      vi.mocked(getBlogPostBySlug).mockResolvedValue(makePost({ metaTitle: 'SEO заголовок' }))
      const meta = await generateMetadata(props)
      expect(meta.title).toBe('SEO заголовок — Химичка')
    })

    it('не дублирует бренд, если он уже есть в title', async () => {
      vi.mocked(getBlogPostBySlug).mockResolvedValue(makePost({ metaTitle: 'Пламя — Химичка' }))
      const meta = await generateMetadata(props)
      expect(meta.title).toBe('Пламя — Химичка')
    })

    it('degrades to a generic title when the API fails', async () => {
      vi.mocked(getBlogPostBySlug).mockRejectedValue(new Error('down'))
      const meta = await generateMetadata(props)
      expect(meta.title).toBe('Статья — Химичка')
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
      expect(screen.getByText('Пламя окрашивают ионы меди.')).toBeInTheDocument()
    })

    it('emits BlogPosting JSON-LD with publishedAt and BreadcrumbList with Блог', async () => {
      vi.mocked(getBlogPostBySlug).mockResolvedValue(makePost())

      const { container } = render(await BlogPostPage(props))
      const data = Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map(
        (s) => JSON.parse(s.textContent ?? '{}'),
      )

      const article = data.find((d) => d['@type'] === 'BlogPosting')
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

    it('обложка, оглавление, текст и автор лежат в колонке на 9 из 12 колонок', async () => {
      vi.mocked(getBlogPostBySlug).mockResolvedValue(
        makePost({
          coverImageUrl: '/uploads/blog/flame.jpg',
          authorName: 'Василий Аистов',
          blocks: [
            { type: 'paragraph', html: '<h2>Один</h2><p>Текст.</p>' },
            { type: 'paragraph', html: '<h2>Два</h2><p>Текст.</p>' },
            { type: 'paragraph', html: '<h2>Три</h2><p>Текст.</p>' },
          ],
        }),
      )

      const { container } = render(await BlogPostPage(props))
      const column = container.querySelector('[data-blog-article-column]')
      expect(column).not.toBeNull()
      // 9/12 только с lg: на узких экранах колонка занимает всю ширину.
      expect(column!.className).toContain('lg:w-9/12')
      // Абзацы блоков внутри колонки не ограничены 60ch.
      expect(column!.className).toContain('[&_[data-block=paragraph]]:max-w-none')
      expect(column!.querySelector('img')).not.toBeNull()
      expect(column!.querySelector('[data-block=paragraph]')).not.toBeNull()
      expect(column!.querySelector('nav')).not.toBeNull() // оглавление
      expect(column!.querySelector('section')).not.toBeNull() // «Об авторе»
    })

    it('omits the cover block when there is no cover', async () => {
      vi.mocked(getBlogPostBySlug).mockResolvedValue(makePost())

      const { container } = render(await BlogPostPage(props))
      expect(container.querySelector('img')).toBeNull()
    })
  })

  describe('сигналы экспертности и перелинковка', () => {
    const MIDDAY = '2026-06-01T12:00:00.000Z'

    function jsonLd(container: HTMLElement) {
      return Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map((s) =>
        JSON.parse(s.textContent ?? '{}'),
      )
    }

    beforeEach(() => {
      vi.mocked(listBlogPosts).mockResolvedValue({
        data: [],
        pagination: { limit: 100, offset: 0, page: 1, total: 0 },
      })
    })

    describe('даты', () => {
      it('показывает «Обновлено», когда дата правки позже даты публикации', async () => {
        vi.mocked(getBlogPostBySlug).mockResolvedValue(
          makePost({ publishedAt: MIDDAY, updatedAt: '2026-06-05T12:00:00.000Z' }),
        )
        render(await BlogPostPage(props))
        expect(screen.getByText('1 июня 2026')).toBeInTheDocument()
        expect(screen.getByText(/Обновлено/)).toBeInTheDocument()
        expect(screen.getByText('5 июня 2026')).toBeInTheDocument()
      })

      it('не показывает «Обновлено», если правка в тот же день', async () => {
        vi.mocked(getBlogPostBySlug).mockResolvedValue(
          makePost({ publishedAt: MIDDAY, updatedAt: '2026-06-01T13:00:00.000Z' }),
        )
        render(await BlogPostPage(props))
        expect(screen.queryByText(/Обновлено/)).toBeNull()
      })

      it('«Обновлено» считается от даты создания, когда publishedAt нет', async () => {
        vi.mocked(getBlogPostBySlug).mockResolvedValue(
          makePost({
            publishedAt: null,
            createdAt: MIDDAY,
            updatedAt: '2026-06-09T12:00:00.000Z',
          }),
        )
        render(await BlogPostPage(props))
        expect(screen.getByText('9 июня 2026')).toBeInTheDocument()
      })
    })

    describe('оглавление', () => {
      const headings = (n: number) => ({
        type: 'paragraph',
        html: Array.from({ length: n }, (_, i) => `<h2>Раздел ${i + 1}</h2><p>текст</p>`).join(''),
      })

      it('с тремя заголовками показывает оглавление и якоря на заголовках', async () => {
        vi.mocked(getBlogPostBySlug).mockResolvedValue(makePost({ blocks: [headings(3)] }))
        const { container } = render(await BlogPostPage(props))
        const nav = screen.getByRole('navigation', { name: 'Содержание' })
        const hrefs = Array.from(nav.querySelectorAll('a')).map((a) => a.getAttribute('href'))
        expect(hrefs).toEqual(['#razdel-1', '#razdel-2', '#razdel-3'])
        for (const href of hrefs) {
          const id = (href as string).slice(1)
          expect(container.querySelector(`h2[id="${id}"]`)).not.toBeNull()
        }
      })

      it('с двумя заголовками оглавления нет, но тело статьи на месте', async () => {
        vi.mocked(getBlogPostBySlug).mockResolvedValue(makePost({ blocks: [headings(2)] }))
        render(await BlogPostPage(props))
        expect(screen.queryByRole('navigation', { name: 'Содержание' })).toBeNull()
        expect(screen.getByRole('heading', { level: 2, name: 'Раздел 1' })).toBeInTheDocument()
      })
    })

    describe('автор', () => {
      const author = {
        authorName: 'Имя Фамилия',
        authorJobTitle: 'Должность',
        authorBio: 'Справка об авторе',
        authorUrl: 'https://example.com/profile',
      }

      it('с автором: блок «Об авторе» внизу и Person в BlogPosting', async () => {
        vi.mocked(getBlogPostBySlug).mockResolvedValue(makePost(author))
        const { container } = render(await BlogPostPage(props))
        expect(screen.getByRole('region', { name: 'Об авторе' })).toBeInTheDocument()
        expect(screen.getByText('Справка об авторе')).toBeInTheDocument()
        const article = jsonLd(container).find((d) => d['@type'] === 'BlogPosting')
        expect(article.author).toEqual({
          '@type': 'Person',
          name: 'Имя Фамилия',
          jobTitle: 'Должность',
          url: 'https://example.com/profile',
        })
        expect(article.publisher).toMatchObject({ '@type': 'Organization', name: 'Химичка' })
      })

      it('без автора: блока нет, автор в разметке — Organization', async () => {
        vi.mocked(getBlogPostBySlug).mockResolvedValue(makePost())
        const { container } = render(await BlogPostPage(props))
        expect(screen.queryByRole('region', { name: 'Об авторе' })).toBeNull()
        const article = jsonLd(container).find((d) => d['@type'] === 'BlogPosting')
        expect(article.author).toMatchObject({ '@type': 'Organization', name: 'Химичка' })
      })
    })

    describe('похожие статьи', () => {
      function listOf(posts: BlogPost[]) {
        vi.mocked(listBlogPosts).mockResolvedValue({
          data: posts,
          pagination: { limit: 100, offset: 0, page: 1, total: posts.length },
        })
      }

      it('показывает до трёх статей той же рубрики без текущей и без noindex', async () => {
        const current = makePost()
        vi.mocked(getBlogPostBySlug).mockResolvedValue(current)
        listOf([
          current,
          makePost({ id: 'r1', slug: 'r1', title: 'Опыт 1', rubric: 'Опыты' }),
          makePost({ id: 'r2', slug: 'r2', title: 'Опыт 2', rubric: 'Опыты' }),
          makePost({ id: 'r3', slug: 'r3', title: 'Опыт 3', rubric: 'Опыты' }),
          makePost({ id: 'r4', slug: 'r4', title: 'Опыт 4', rubric: 'Опыты' }),
          makePost({ id: 'h', slug: 'h', title: 'Скрытая', rubric: 'Опыты', noindex: true }),
          makePost({ id: 'n', slug: 'n', title: 'Новость', rubric: 'Новости' }),
        ])
        render(await BlogPostPage(props))
        expect(
          screen.getByRole('heading', { level: 2, name: 'Похожие статьи' }),
        ).toBeInTheDocument()
        const links = screen
          .getAllByRole('link')
          .map((a) => a.getAttribute('href'))
          .filter((h) => h?.startsWith('/blog/') && h !== '/blog')
        // Три карточки, каждая — ссылка на статью (у карточки их две: обложка и заголовок).
        expect(new Set(links).size).toBe(3)
        expect(links).not.toContain('/blog/pochemu-plamya-sinee')
        expect(links).not.toContain('/blog/h')
        expect(links).not.toContain('/blog/n')
      })

      it('если в рубрике мало статей — добирает последними из других', async () => {
        const current = makePost()
        vi.mocked(getBlogPostBySlug).mockResolvedValue(current)
        listOf([current, makePost({ id: 'n', slug: 'n', title: 'Новость', rubric: 'Новости' })])
        render(await BlogPostPage(props))
        expect(screen.getByRole('link', { name: 'Новость' })).toHaveAttribute('href', '/blog/n')
      })

      it('нет других статей — блока нет', async () => {
        const current = makePost()
        vi.mocked(getBlogPostBySlug).mockResolvedValue(current)
        listOf([current])
        render(await BlogPostPage(props))
        expect(screen.queryByText('Похожие статьи')).toBeNull()
      })

      it('сбой списка статей не роняет страницу', async () => {
        vi.mocked(getBlogPostBySlug).mockResolvedValue(makePost())
        vi.mocked(listBlogPosts).mockRejectedValue(new Error('offline'))
        render(await BlogPostPage(props))
        expect(
          screen.getByRole('heading', { level: 1, name: 'Почему пламя синее' }),
        ).toBeInTheDocument()
        expect(screen.queryByText('Похожие статьи')).toBeNull()
      })
    })
  })
})
