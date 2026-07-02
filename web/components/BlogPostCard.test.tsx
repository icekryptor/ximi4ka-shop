import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { BlogPost } from '@ximi4ka-shop/shared'
import { BlogPostCard } from './BlogPostCard'

afterEach(() => {
  cleanup()
})

function makePost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: 'bp1',
    slug: 'pochemu-plamya-sinee',
    title: 'Почему пламя синее',
    excerpt: 'Разбираем химию горения на кухне.',
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

describe('BlogPostCard', () => {
  it('renders the title linking to /blog/[slug]', () => {
    render(<BlogPostCard post={makePost()} />)
    const link = screen.getByRole('link', { name: 'Почему пламя синее' })
    expect(link).toHaveAttribute('href', '/blog/pochemu-plamya-sinee')
  })

  it('renders rubric, excerpt and the ru-RU publish date', () => {
    render(<BlogPostCard post={makePost()} />)
    expect(screen.getByText('Опыты')).toBeInTheDocument()
    expect(
      screen.getByText('Разбираем химию горения на кухне.'),
    ).toBeInTheDocument()
    expect(screen.getByText('1 июня 2026')).toBeInTheDocument()
  })

  it('renders the cover image when coverImageUrl is set', () => {
    // The cover link is aria-hidden (the title link is the accessible
    // entry point), so query the DOM directly rather than by role.
    const { container } = render(
      <BlogPostCard
        post={makePost({ coverImageUrl: '/uploads/blog/flame.jpg' })}
      />,
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('alt', 'Почему пламя синее')
  })

  it('renders a specimen-style fallback when there is no cover', () => {
    const { container } = render(<BlogPostCard post={makePost()} />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText(/ОБЛОЖКА ГОТОВИТСЯ/i)).toBeInTheDocument()
  })

  it('falls back to createdAt when publishedAt is missing', () => {
    render(<BlogPostCard post={makePost({ publishedAt: null })} />)
    expect(screen.getByText('1 мая 2026')).toBeInTheDocument()
  })

  it('omits rubric and excerpt blocks when the post has none', () => {
    render(<BlogPostCard post={makePost({ rubric: null, excerpt: null })} />)
    expect(screen.queryByText('Опыты')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Разбираем химию горения на кухне.'),
    ).not.toBeInTheDocument()
  })
})
