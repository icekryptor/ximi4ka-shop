// Контракт данных api/data/seo-blog-drafts.json: 10 черновиков SEO-статей.
// Тесты фиксируют требования плана и редакционные запреты (обещания «без
// присмотра», «лучшая цена», штампы), чтобы правка текста их не сломала.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
import { loadSeoBlogDrafts, type SeoBlogDraft } from './seo-blog-drafts.js'

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../data')

const KNOWN_RUBRICS = ['Химия школьнику', 'Наборы для опытов']

const FORBIDDEN_PHRASES = [
  'безопасно для детей без присмотра',
  'лучшая цена',
  'гаранти',
  'в современном мире',
  'стоит отметить',
  'давайте разберёмся',
  'давайте разберемся',
  'сертифицир',
]

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Весь читаемый текст статьи: абзацы, FAQ и заголовок сетки товаров.
function articleText(draft: SeoBlogDraft): string {
  const parts: string[] = []
  for (const block of draft.blocks) {
    if (block.type === 'paragraph') parts.push(stripHtml(block.html))
    else if (block.type === 'faq')
      for (const item of block.items) parts.push(item.question, item.answer)
    else if (block.type === 'product_grid' && block.heading) parts.push(block.heading)
  }
  return parts.join(' ')
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
}

function h2Titles(draft: SeoBlogDraft): string[] {
  const titles: string[] = []
  for (const block of draft.blocks) {
    if (block.type !== 'paragraph') continue
    for (const m of block.html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gs)) titles.push(stripHtml(m[1]!))
  }
  return titles
}

describe('data/seo-blog-drafts.json', () => {
  it('содержит ровно 10 статей с уникальными slug', async () => {
    const drafts = await loadSeoBlogDrafts()
    expect(drafts).toHaveLength(10)
    const slugs = drafts.map((d) => d.slug)
    expect(new Set(slugs).size).toBe(10)
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(slug.length).toBeLessThanOrEqual(60)
    }
  })

  it('не задаёт обложку и автора, всегда isPublished=false', async () => {
    const raw = JSON.parse(await readFile(path.join(DATA_DIR, 'seo-blog-drafts.json'), 'utf-8'))
    for (const entry of raw as Record<string, unknown>[]) {
      expect(entry.isPublished).toBe(false)
      expect(entry).not.toHaveProperty('coverImageUrl')
      expect(entry).not.toHaveProperty('ogImage')
      expect(entry).not.toHaveProperty('author')
      expect(entry).not.toHaveProperty('authorName')
    }
  })

  it('заголовок 60–80 символов, metaTitle ≤65 без бренда, metaDescription ≤160', async () => {
    for (const d of await loadSeoBlogDrafts()) {
      expect(d.title.length, `title ${d.slug}`).toBeGreaterThanOrEqual(60)
      expect(d.title.length, `title ${d.slug}`).toBeLessThanOrEqual(80)
      expect(d.metaTitle.length, `metaTitle ${d.slug}`).toBeGreaterThanOrEqual(30)
      expect(d.metaTitle.length, `metaTitle ${d.slug}`).toBeLessThanOrEqual(65)
      expect(d.metaTitle, `brand in metaTitle ${d.slug}`).not.toMatch(/химичк|ximi4ka|\|/i)
      expect(d.metaDescription.length, `metaDescription ${d.slug}`).toBeGreaterThanOrEqual(80)
      expect(d.metaDescription.length, `metaDescription ${d.slug}`).toBeLessThanOrEqual(160)
      expect(d.excerpt.trim().length, `excerpt ${d.slug}`).toBeGreaterThan(40)
    }
  })

  it('рубрика — из уже существующих в данных блога', async () => {
    const existing = JSON.parse(
      await readFile(path.join(DATA_DIR, 'tilda-articles.json'), 'utf-8'),
    ) as { rubric: string }[]
    const existingRubrics = new Set(existing.map((a) => a.rubric))
    for (const d of await loadSeoBlogDrafts()) {
      expect(KNOWN_RUBRICS).toContain(d.rubric)
      expect(existingRubrics.has(d.rubric)).toBe(true)
    }
  })

  it('объём 900–1500 слов, 4–7 содержательных разделов h2, без картинок', async () => {
    for (const d of await loadSeoBlogDrafts()) {
      const words = wordCount(articleText(d))
      expect(words, `слов в ${d.slug}`).toBeGreaterThanOrEqual(900)
      expect(words, `слов в ${d.slug}`).toBeLessThanOrEqual(1500)
      // Разделы по существу: без служебных «Безопасность», FAQ и «Итог».
      const sections = h2Titles(d).filter((t) => !/часто задаваемые|безопасност|^итог/i.test(t))
      expect(sections.length, `разделов h2 в ${d.slug}`).toBeGreaterThanOrEqual(4)
      expect(sections.length, `разделов h2 в ${d.slug}`).toBeLessThanOrEqual(7)
      expect(
        d.blocks.some((b) => b.type === 'image'),
        `image в ${d.slug}`,
      ).toBe(false)
    }
  })

  it('все блоки валидны и первым идёт вступление, а не заголовок', async () => {
    for (const d of await loadSeoBlogDrafts()) {
      expect(d.blocks.every((b) => isBlock(b))).toBe(true)
      const first = d.blocks[0]!
      expect(first.type).toBe('paragraph')
      if (first.type === 'paragraph') expect(first.html).not.toMatch(/<h[1-4]/)
    }
  })

  it('FAQ: один блок, 3–5 вопросов с ответами', async () => {
    for (const d of await loadSeoBlogDrafts()) {
      const faqs = d.blocks.filter((b) => b.type === 'faq')
      expect(faqs, `faq в ${d.slug}`).toHaveLength(1)
      const items = faqs[0]!.type === 'faq' ? faqs[0]!.items : []
      expect(items.length).toBeGreaterThanOrEqual(3)
      expect(items.length).toBeLessThanOrEqual(5)
      for (const item of items) {
        expect(item.question.trim().length).toBeGreaterThan(10)
        expect(item.answer.trim().length).toBeGreaterThan(30)
      }
    }
  })

  it('product_grid: один блок, 1–3 существующих slug из каталога', async () => {
    const catalog = JSON.parse(
      await readFile(path.join(DATA_DIR, 'tilda-catalog.json'), 'utf-8'),
    ) as { slug: string }[]
    const catalogSlugs = new Set(catalog.map((p) => p.slug))
    for (const d of await loadSeoBlogDrafts()) {
      const grids = d.blocks.filter((b) => b.type === 'product_grid')
      expect(grids, `product_grid в ${d.slug}`).toHaveLength(1)
      const slugs = grids[0]!.type === 'product_grid' ? grids[0]!.productSlugs : []
      expect(slugs.length).toBeGreaterThanOrEqual(1)
      expect(slugs.length).toBeLessThanOrEqual(3)
      expect(new Set(slugs).size).toBe(slugs.length)
      for (const s of slugs) expect(catalogSlugs.has(s), `${d.slug}: нет товара ${s}`).toBe(true)
    }
  })

  it('ссылки внутри текста ведут только на существующие товары', async () => {
    const catalog = JSON.parse(
      await readFile(path.join(DATA_DIR, 'tilda-catalog.json'), 'utf-8'),
    ) as { slug: string }[]
    const catalogSlugs = new Set(catalog.map((p) => p.slug))
    for (const d of await loadSeoBlogDrafts()) {
      for (const block of d.blocks) {
        if (block.type !== 'paragraph') continue
        for (const m of block.html.matchAll(/href="([^"]*)"/g)) {
          const href = m[1]!
          expect(href, `${d.slug}: ссылка ${href}`).toMatch(/^\/product\/[a-z0-9-]+$/)
          expect(catalogSlugs.has(href.replace('/product/', ''))).toBe(true)
        }
      }
    }
  })

  it('есть раздел «Безопасность»', async () => {
    for (const d of await loadSeoBlogDrafts()) {
      expect(
        h2Titles(d).some((t) => /безопасност/i.test(t)),
        `раздел безопасности в ${d.slug}`,
      ).toBe(true)
    }
  })

  it('нет запрещённых фраз, цен и штампов', async () => {
    for (const d of await loadSeoBlogDrafts()) {
      const text = [d.title, d.metaTitle, d.metaDescription, d.excerpt, articleText(d)]
        .join(' ')
        .toLowerCase()
      for (const phrase of FORBIDDEN_PHRASES) {
        expect(text, `«${phrase}» в ${d.slug}`).not.toContain(phrase)
      }
      expect(text, `цена в ${d.slug}`).not.toMatch(/\d\s*(₽|руб)/)
    }
  })
})
