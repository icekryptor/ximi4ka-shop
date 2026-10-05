// Контракт данных api/data/seo-article-refresh.json (правки старых статей с
// Tilda, которые заливает seeds/import-seo-article-refresh.ts): slug статей и
// товаров существуют, мета в лимитах, FAQ только там, где его нет, ссылки
// ведут на реальные страницы, нет обещаний, которых мы не можем подтвердить.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import type { Block } from '@ximi4ka-shop/shared'
import {
  META_DESCRIPTION_MAX,
  META_TITLE_MAX,
  loadSeoArticleRefresh,
  type SeoArticleRefresh,
} from './_lib/seo-article-refresh.js'

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data')

interface TildaArticle {
  slug: string
  title: string
  coverImageUrl: string | null
  metaDescription: string | null
  blocks: Array<{ type: string }>
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(path.join(DATA_DIR, file), 'utf-8')) as T
}

const REFRESHED_SLUGS = [
  'khimiya-v-shkole',
  'nabory-dlya-opytov-himichka',
  'podhodyat-li-nabory-dlya-oge',
  'himiya-8-klass-programma',
]

// Формулировки, которых в новых текстах быть не должно: обещания, которых мы не
// можем подтвердить данными товара, и «гарантии» результата экзамена.
const FORBIDDEN: Array<[string, RegExp]> = [
  ['лучший', /лучш(?:ий|ая|ее|ие|его|ей|ему|им|ими|ую|их)(?![а-яё])/i],
  ['гарантия', /гаранти/i],
  ['сертификат', /сертифиц/i],
  ['безопасно для детей', /безопасн\S*\s+для\s+дет/i],
  ['безопасный/безопасно', /безопасн(?:о|ый|ая|ое|ые|ых|ым|ой)(?![а-яё])/i],
  ['сдаст/баллы', /сда(?:ст|дите|ёт|ет)|балл/i],
]

function textsOf(block: Block): string[] {
  switch (block.type) {
    case 'paragraph':
      return [block.html.replace(/<[^>]+>/g, ' ')]
    case 'faq':
      return block.items.flatMap((i) => [i.question, i.answer])
    case 'product_grid':
      return [block.heading ?? '']
    default:
      return []
  }
}

function allTexts(e: SeoArticleRefresh): string[] {
  return [
    e.metaTitle ?? '',
    e.metaDescription ?? '',
    ...(e.appendBlocks ?? []).flatMap((b) => textsOf(b)),
  ]
}

describe('data/seo-article-refresh.json', () => {
  it('содержит ровно 4 старые статьи, slug уникальны и есть в tilda-articles.json', async () => {
    const entries = await loadSeoArticleRefresh()
    const articles = await readJson<TildaArticle[]>('tilda-articles.json')
    const bySlug = new Map(articles.map((a) => [a.slug, a]))

    expect(entries.map((e) => e.slug).sort()).toEqual([...REFRESHED_SLUGS].sort())
    expect(new Set(entries.map((e) => e.slug)).size).toBe(entries.length)
    for (const e of entries) {
      expect(bySlug.has(e.slug), `slug ${e.slug} не найден в tilda-articles.json`).toBe(true)
      expect(e.name, e.slug).toBe(bySlug.get(e.slug)!.title)
    }
  })

  it('все записи — черновики до вычитки владельцем', async () => {
    for (const e of await loadSeoArticleRefresh()) expect(e.draft, e.slug).toBe(true)
  })

  it('metaTitle у всех: ≤ 65 символов, без суффикса бренда, не равен названию статьи', async () => {
    const articles = await readJson<TildaArticle[]>('tilda-articles.json')
    const titles = new Map(articles.map((a) => [a.slug, a.title]))
    for (const e of await loadSeoArticleRefresh()) {
      expect(e.metaTitle, e.slug).toBeTruthy()
      expect(e.metaTitle!.length, e.slug).toBeLessThanOrEqual(META_TITLE_MAX)
      expect(e.metaTitle!, e.slug).not.toMatch(/химичка\s*$/i)
      expect(e.metaTitle, e.slug).not.toBe(titles.get(e.slug))
    }
  })

  it('metaDescription задан там, где в данных статьи он пуст, и ≤ 160 символов', async () => {
    const articles = await readJson<TildaArticle[]>('tilda-articles.json')
    const byslug = new Map(articles.map((a) => [a.slug, a]))
    for (const e of await loadSeoArticleRefresh()) {
      if (!byslug.get(e.slug)!.metaDescription) {
        expect(e.metaDescription, e.slug).toBeTruthy()
      }
      if (e.metaDescription !== undefined) {
        expect(e.metaDescription.length, e.slug).toBeLessThanOrEqual(META_DESCRIPTION_MAX)
        expect(e.metaDescription.length, e.slug).toBeGreaterThanOrEqual(70)
      }
    }
  })

  it('автор — Василий Аистов (должность, био и фото не заданы)', async () => {
    for (const e of await loadSeoArticleRefresh()) {
      expect(e.authorName, e.slug).toBe('Василий Аистов')
      expect(Object.keys(e), e.slug).not.toContain('authorBio')
      expect(Object.keys(e), e.slug).not.toContain('authorJobTitle')
      expect(Object.keys(e), e.slug).not.toContain('authorPhotoUrl')
    }
  })

  it('дописываются только faq, product_grid и paragraph, product_grid — 1–3 реальных товара', async () => {
    const catalog = await readJson<Array<{ slug: string }>>('tilda-catalog.json')
    const products = new Set(catalog.map((p) => p.slug))
    for (const e of await loadSeoArticleRefresh()) {
      const blocks = e.appendBlocks ?? []
      expect(blocks.length, e.slug).toBeGreaterThan(0)
      for (const b of blocks) expect(['faq', 'product_grid', 'paragraph'], e.slug).toContain(b.type)
      const grids = blocks.filter((b) => b.type === 'product_grid')
      expect(grids, e.slug).toHaveLength(1)
      for (const g of grids) {
        expect(g.productSlugs.length, e.slug).toBeGreaterThanOrEqual(1)
        expect(g.productSlugs.length, e.slug).toBeLessThanOrEqual(3)
        for (const s of g.productSlugs) {
          expect(products.has(s), `товар ${s} не найден в tilda-catalog.json`).toBe(true)
        }
      }
    }
  })

  it('FAQ из 3 вопросов добавлен только статьям, у которых блока faq ещё нет', async () => {
    const articles = await readJson<TildaArticle[]>('tilda-articles.json')
    const byslug = new Map(articles.map((a) => [a.slug, a]))
    for (const e of await loadSeoArticleRefresh()) {
      const faqs = (e.appendBlocks ?? []).filter((b) => b.type === 'faq')
      const hasFaq = byslug.get(e.slug)!.blocks.some((b) => b.type === 'faq')
      if (hasFaq) {
        expect(faqs, `${e.slug}: faq уже есть в статье`).toHaveLength(0)
      } else {
        expect(faqs, e.slug).toHaveLength(1)
        const faq = faqs[0]!
        if (faq.type !== 'faq') throw new Error('unreachable')
        expect(faq.items, e.slug).toHaveLength(3)
        for (const item of faq.items) {
          expect(item.question.trim().endsWith('?'), `${e.slug}: ${item.question}`).toBe(true)
          expect(item.answer.length, e.slug).toBeGreaterThan(30)
        }
      }
    }
  })

  it('«Читайте также»: 1–3 ссылки на реальные статьи или товары, не на саму статью', async () => {
    const articles = await readJson<TildaArticle[]>('tilda-articles.json')
    const drafts = await readJson<Array<{ slug: string }>>('seo-blog-drafts.json')
    const catalog = await readJson<Array<{ slug: string }>>('tilda-catalog.json')
    const posts = new Set([...articles.map((a) => a.slug), ...drafts.map((d) => d.slug)])
    const products = new Set(catalog.map((p) => p.slug))

    for (const e of await loadSeoArticleRefresh()) {
      const alsoRead = (e.appendBlocks ?? []).filter(
        (b) => b.type === 'paragraph' && b.html.startsWith('<h2>Читайте также</h2>'),
      )
      expect(alsoRead, e.slug).toHaveLength(1)
      const html = alsoRead[0]!.type === 'paragraph' ? alsoRead[0]!.html : ''
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!)
      expect(hrefs.length, e.slug).toBeGreaterThanOrEqual(1)
      expect(hrefs.length, e.slug).toBeLessThanOrEqual(3)
      for (const href of hrefs) {
        const blog = /^\/blog\/([a-z0-9-]+)$/.exec(href)
        const product = /^\/product\/([a-z0-9-]+)$/.exec(href)
        expect(blog || product, `${e.slug}: неожиданная ссылка ${href}`).toBeTruthy()
        if (blog) {
          expect(posts.has(blog[1]!), `${e.slug}: статьи ${href} нет в данных`).toBe(true)
          expect(blog[1], `${e.slug}: ссылка на самого себя`).not.toBe(e.slug)
        }
        if (product) expect(products.has(product[1]!), `нет товара ${href}`).toBe(true)
      }
    }
  })

  it('нет запрещённых формулировок', async () => {
    for (const e of await loadSeoArticleRefresh()) {
      for (const text of allTexts(e)) {
        for (const [label, re] of FORBIDDEN) {
          expect(re.test(text), `${e.slug}: «${label}» в «${text.slice(0, 60)}»`).toBe(false)
        }
      }
    }
  })
})
