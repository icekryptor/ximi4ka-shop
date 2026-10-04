import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { BlogPost } from '@ximi4ka-shop/shared'
import { RelatedPosts } from './RelatedPosts'

afterEach(() => {
  cleanup()
})

function makePost(slug: string): BlogPost {
  return {
    id: slug,
    slug,
    title: `Статья ${slug}`,
    excerpt: null,
    coverImageUrl: null,
    rubric: 'Опыты',
    authorName: null,
    authorJobTitle: null,
    authorBio: null,
    authorUrl: null,
    authorPhotoUrl: null,
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
  }
}

describe('RelatedPosts', () => {
  it('выводит заголовок и карточки с ссылками на статьи', () => {
    render(<RelatedPosts posts={[makePost('a'), makePost('b')]} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Похожие статьи' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Статья a' })).toHaveAttribute('href', '/blog/a')
    expect(screen.getByRole('link', { name: 'Статья b' })).toHaveAttribute('href', '/blog/b')
  })

  it('без статей блока нет', () => {
    const { container } = render(<RelatedPosts posts={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
