import { describe, it, expect } from 'vitest'
import type { BlogPost } from '@ximi4ka-shop/shared'
import { RELATED_POSTS_LIMIT, pickRelatedPosts } from './relatedPosts'

function makePost(slug: string, overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: slug,
    slug,
    title: slug,
    excerpt: null,
    coverImageUrl: null,
    rubric: null,
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
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

const day = (d: number) => `2026-06-${String(d).padStart(2, '0')}T00:00:00.000Z`

describe('pickRelatedPosts', () => {
  it('лимит по умолчанию — три статьи', () => {
    expect(RELATED_POSTS_LIMIT).toBe(3)
  })

  it('берёт статьи той же рубрики, новые первыми', () => {
    const current = makePost('cur', { rubric: 'Опыты' })
    const out = pickRelatedPosts(current, [
      makePost('a', { rubric: 'Опыты', publishedAt: day(1) }),
      makePost('b', { rubric: 'Опыты', publishedAt: day(3) }),
      makePost('c', { rubric: 'Новости', publishedAt: day(5) }),
      makePost('d', { rubric: 'Опыты', publishedAt: day(2) }),
    ])
    expect(out.map((p) => p.slug)).toEqual(['b', 'd', 'a'])
  })

  it('если в рубрике меньше трёх — добивает последними из остальных', () => {
    const current = makePost('cur', { rubric: 'Опыты' })
    const out = pickRelatedPosts(current, [
      makePost('same', { rubric: 'Опыты', publishedAt: day(1) }),
      makePost('x', { rubric: 'Новости', publishedAt: day(4) }),
      makePost('y', { rubric: null, publishedAt: day(6) }),
      makePost('z', { rubric: 'Другое', publishedAt: day(5) }),
    ])
    expect(out.map((p) => p.slug)).toEqual(['same', 'y', 'z'])
  })

  it('без рубрики у текущей статьи — просто последние', () => {
    const current = makePost('cur', { rubric: null })
    const out = pickRelatedPosts(current, [
      makePost('a', { rubric: null, publishedAt: day(1) }),
      makePost('b', { rubric: 'Опыты', publishedAt: day(2) }),
      makePost('c', { rubric: null, publishedAt: day(3) }),
      makePost('d', { rubric: null, publishedAt: day(4) }),
    ])
    expect(out.map((p) => p.slug)).toEqual(['d', 'c', 'b'])
  })

  it('исключает текущую статью, черновики и noindex', () => {
    const current = makePost('cur', { rubric: 'Опыты' })
    const out = pickRelatedPosts(current, [
      current,
      makePost('draft', { rubric: 'Опыты', isPublished: false }),
      makePost('hidden', { rubric: 'Опыты', noindex: true }),
      makePost('ok', { rubric: 'Опыты' }),
    ])
    expect(out.map((p) => p.slug)).toEqual(['ok'])
  })

  it('пустой список кандидатов — пустой результат', () => {
    expect(pickRelatedPosts(makePost('cur'), [])).toEqual([])
  })

  it('использует createdAt, когда publishedAt не задан', () => {
    const out = pickRelatedPosts(makePost('cur'), [
      makePost('old', { publishedAt: null, createdAt: day(1) }),
      makePost('new', { publishedAt: null, createdAt: day(9) }),
    ])
    expect(out.map((p) => p.slug)).toEqual(['new', 'old'])
  })

  it('уважает явный limit', () => {
    const out = pickRelatedPosts(makePost('cur'), [makePost('a'), makePost('b'), makePost('c')], 2)
    expect(out).toHaveLength(2)
  })

  it('не мутирует входной массив', () => {
    const input = [makePost('a', { publishedAt: day(1) }), makePost('b', { publishedAt: day(2) })]
    pickRelatedPosts(makePost('cur'), input)
    expect(input.map((p) => p.slug)).toEqual(['a', 'b'])
  })
})
