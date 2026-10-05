// Контракт данных api/data/seo-category-texts.json (черновики SEO-текстов
// категорий, которые заливает seeds/import-seo-category-texts.ts): существование
// категорий и товаров, длины, структура блоков, ссылки, безопасность и запрещённые
// формулировки.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
import { CATALOG_CATEGORIES } from './_lib/tilda-crawl.js'
import {
  META_DESCRIPTION_MAX,
  META_TITLE_MAX,
  type SeoCategoryText,
} from './_lib/seo-category-texts.js'

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data')

interface CatalogEntry {
  slug: string
  name: string
  categorySlug: string
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(path.join(DATA_DIR, file), 'utf-8')) as T
}

// Категории, для которых написан текст. print (печатная продукция) в задачу не вошла.
const TEXTED_SLUGS = ['reagents', 'equipment', 'kits', 'combo']

// Целевые запросы ядра: «химические реактивы» (638), «лабораторное оборудование»
// (331), «набор юного химика» (238), «набор для опытов для детей» (216),
// «набор для опытов» (166). У combo своего кластера нет — искусственных ключей нет.
const KEYWORDS: Record<string, RegExp[]> = {
  reagents: [/химическ\S+\s+реактив/i],
  equipment: [/лабораторн\S+\s+оборудовани/i],
  kits: [/набор\S*\s+юного\s+химика/i, /набор\S*\s+для\s+опытов/i],
}

// Формулировки, которых в SEO-текстах быть не должно: обещания, которых мы не
// можем подтвердить данными каталога, и штампы (WORKFLOW 6.3).
const FORBIDDEN: Array<[string, RegExp]> = [
  ['лучший', /лучш(?:ий|ая|ее|ие|его|ей|ему|им|ими|ую|их)(?![а-яё])/i],
  ['лучшая цена', /лучш\S*\s+цен/i],
  ['гарантия', /гаранти/i],
  ['сертификат', /сертифиц/i],
  ['безопасно для детей', /безопасн\S*\s+для\s+дет/i],
  ['без присмотра', /без\s+присмотра\s+взросл/i],
  ['безопасный/безопасно', /безопасн(?:о|ый|ая|ое|ые|ых|ым|ой)(?![а-яё])/i],
  ['в современном мире', /в\s+современном\s+мире/i],
  ['стоит отметить', /стоит\s+отметить/i],
  ['давайте разберёмся', /давайте\s+разбер/i],
  ['лечит/лечебн', /лечеб|лечит|излечи/i],
]

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function words(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
}

function paragraphHtml(e: SeoCategoryText): string[] {
  return (e.seoBlocks ?? []).flatMap((b) => (b.type === 'paragraph' ? [b.html] : []))
}

function faqItems(e: SeoCategoryText) {
  return (e.seoBlocks ?? []).flatMap((b) => (b.type === 'faq' ? b.items : []))
}

function allTexts(e: SeoCategoryText): string[] {
  return [
    e.metaTitle ?? '',
    e.metaDescription ?? '',
    ...paragraphHtml(e).map(stripTags),
    ...faqItems(e).flatMap((f) => [f.question, f.answer]),
  ]
}

function bodyText(e: SeoCategoryText): string {
  return paragraphHtml(e).map(stripTags).join(' ').toLowerCase()
}

function hrefs(e: SeoCategoryText): string[] {
  return paragraphHtml(e).flatMap((html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!))
}

describe('data/seo-category-texts.json', () => {
  it('slug уникальны, это категории каталога, name совпадает; покрыты все четыре категории', async () => {
    const entries = await readJson<SeoCategoryText[]>('seo-category-texts.json')
    const byslug = new Map<string, string>(CATALOG_CATEGORIES.map((c) => [c.slug, c.name]))

    expect(new Set(entries.map((e) => e.slug)).size).toBe(entries.length)
    expect(entries.map((e) => e.slug).sort()).toEqual([...TEXTED_SLUGS].sort())
    for (const e of entries) {
      expect(byslug.has(e.slug), `slug ${e.slug} не найден в категориях каталога`).toBe(true)
      expect(e.name, e.slug).toBe(byslug.get(e.slug))
    }
  })

  it('каждый текст помечен draft: true', async () => {
    const entries = await readJson<SeoCategoryText[]>('seo-category-texts.json')
    for (const e of entries) expect(e.draft, e.slug).toBe(true)
  })

  it(`metaTitle ≤ ${META_TITLE_MAX} (с брендом — тоже), metaDescription ≤ ${META_DESCRIPTION_MAX} символов, оба уникальны`, async () => {
    const entries = await readJson<SeoCategoryText[]>('seo-category-texts.json')
    for (const e of entries) {
      expect(e.metaTitle, `${e.slug}: metaTitle`).toBeTruthy()
      expect(e.metaDescription, `${e.slug}: metaDescription`).toBeTruthy()
      expect(e.metaTitle!.trim(), e.slug).toBe(e.metaTitle)
      expect(e.metaDescription!.trim(), e.slug).toBe(e.metaDescription)
      // Витрина добавляет « — Химичка» только если итог укладывается в лимит:
      // держим title с запасом, чтобы бренд не отваливался.
      expect(`${e.metaTitle} — Химичка`.length, `${e.slug}: title с брендом`).toBeLessThanOrEqual(
        META_TITLE_MAX,
      )
      expect(e.metaDescription!.length, `${e.slug}: description`).toBeLessThanOrEqual(
        META_DESCRIPTION_MAX,
      )
      // title не повторяет H1 (название категории) дословно.
      expect(e.metaTitle!.toLowerCase(), e.slug).not.toBe(e.name.toLowerCase())
    }
    const titles = entries.map((e) => e.metaTitle!.toLowerCase())
    const descriptions = entries.map((e) => e.metaDescription!.toLowerCase())
    expect(new Set(titles).size).toBe(titles.length)
    expect(new Set(descriptions).size).toBe(descriptions.length)
  })

  it('структура: paragraph-блоки с <h2>, ровно один faq-блок в конце, все блоки валидны', async () => {
    const entries = await readJson<SeoCategoryText[]>('seo-category-texts.json')
    for (const e of entries) {
      const blocks = e.seoBlocks ?? []
      expect(blocks.length, e.slug).toBeGreaterThan(2)
      expect(blocks.every(isBlock), `${e.slug}: невалидный блок`).toBe(true)
      expect(
        blocks.every((b) => b.type === 'paragraph' || b.type === 'faq'),
        e.slug,
      ).toBe(true)
      expect(blocks.filter((b) => b.type === 'faq')).toHaveLength(1)
      expect(blocks[blocks.length - 1]!.type, e.slug).toBe('faq')
      // Заголовок — paragraph с одним <h2>/<h3>: отдельного heading-блока нет.
      const headings = paragraphHtml(e).filter((h) => /^<h[23]>[^<]+<\/h[23]>$/.test(h))
      expect(headings.length, `${e.slug}: заголовков`).toBeGreaterThanOrEqual(3)
      expect(paragraphHtml(e)[0], `${e.slug}: текст должен начинаться с заголовка`).toMatch(/^<h2>/)
      // В html нет опасных тегов и атрибутов (санитайзер витрины их всё равно режет).
      for (const html of paragraphHtml(e)) {
        expect(html, e.slug).not.toMatch(/<(script|style|iframe)|\son\w+=|javascript:/i)
      }
    }
  })

  it('текст 250–400 слов (без FAQ), FAQ из 3–4 вопросов с «?» и содержательными ответами', async () => {
    const entries = await readJson<SeoCategoryText[]>('seo-category-texts.json')
    for (const e of entries) {
      const count = words(paragraphHtml(e).map(stripTags).join(' '))
      expect(count, `${e.slug}: ${count} слов`).toBeGreaterThanOrEqual(250)
      expect(count, `${e.slug}: ${count} слов`).toBeLessThanOrEqual(400)

      const faq = faqItems(e)
      expect(faq.length, `${e.slug}: вопросов в FAQ`).toBeGreaterThanOrEqual(3)
      expect(faq.length, `${e.slug}: вопросов в FAQ`).toBeLessThanOrEqual(4)
      for (const item of faq) {
        expect(item.question.trim().endsWith('?'), `${e.slug}: «${item.question}»`).toBe(true)
        expect(item.answer.trim().length, `${e.slug}: «${item.question}»`).toBeGreaterThan(20)
        // Ответ идёт в JSON-LD FAQPage как текст: разметки в нём быть не должно.
        expect(item.answer, e.slug).not.toMatch(/[<>]/)
      }
      expect(new Set(faq.map((f) => f.question)).size).toBe(faq.length)
    }
  })

  it('целевые запросы встречаются в тексте естественно (хотя бы раз), без перечисления', async () => {
    const entries = await readJson<SeoCategoryText[]>('seo-category-texts.json')
    for (const e of entries) {
      const keys = KEYWORDS[e.slug]
      if (!keys) continue
      const haystack = `${e.metaTitle} ${e.metaDescription} ${bodyText(e)}`
      for (const re of keys) expect(haystack, `${e.slug}: нет ${re}`).toMatch(re)
      // Не больше 4 вхождений каждого ключа в тексте (тошнота ≤ 7% из WORKFLOW).
      for (const re of keys) {
        const hits = bodyText(e).match(new RegExp(re.source, 'gi'))?.length ?? 0
        expect(hits, `${e.slug}: ${re} повторяется ${hits} раз`).toBeLessThanOrEqual(4)
      }
    }
  })

  it('ссылки: только относительные /product/… и /categories/…, 3–5 товаров этой категории, соседние категории', async () => {
    const entries = await readJson<SeoCategoryText[]>('seo-category-texts.json')
    const catalog = await readJson<CatalogEntry[]>('tilda-catalog.json')
    const productCategory = new Map(catalog.map((p) => [p.slug, p.categorySlug]))
    const categorySlugs = new Set<string>(CATALOG_CATEGORIES.map((c) => c.slug))

    for (const e of entries) {
      const links = hrefs(e)
      const productSlugs = new Set<string>()
      const categoryLinks = new Set<string>()
      for (const href of links) {
        const product = href.match(/^\/product\/([a-z0-9-]+)$/)
        const category = href.match(/^\/categories\/([a-z0-9-]+)$/)
        expect(product || category, `${e.slug}: ссылка ${href}`).toBeTruthy()
        if (product) {
          expect(productCategory.has(product[1]!), `${e.slug}: товара ${product[1]} нет`).toBe(true)
          expect(
            productCategory.get(product[1]!),
            `${e.slug}: ${product[1]} из другой категории`,
          ).toBe(e.slug)
          productSlugs.add(product[1]!)
        } else {
          expect(categorySlugs.has(category![1]!), `${e.slug}: категории ${href} нет`).toBe(true)
          expect(category![1], `${e.slug}: ссылка на саму себя`).not.toBe(e.slug)
          categoryLinks.add(category![1]!)
        }
      }
      expect(productSlugs.size, `${e.slug}: товаров в ссылках`).toBeGreaterThanOrEqual(3)
      expect(productSlugs.size, `${e.slug}: товаров в ссылках`).toBeLessThanOrEqual(5)
      expect(categoryLinks.size, `${e.slug}: соседних категорий`).toBeGreaterThanOrEqual(2)
      // Одна и та же ссылка не повторяется: перелинковка, а не спам.
      expect(links.length, `${e.slug}: повторы ссылок`).toBe(new Set(links).size)
    }
  })

  it('в текстах нет запрещённых формулировок', async () => {
    const entries = await readJson<SeoCategoryText[]>('seo-category-texts.json')
    for (const e of entries) {
      for (const text of allTexts(e)) {
        for (const [label, re] of FORBIDDEN) {
          expect(re.test(text), `${e.slug}: «${label}» в «${text.slice(0, 60)}…»`).toBe(false)
        }
      }
    }
  })

  it('реактивы: раздел «Безопасность» с очками, перчатками, взрослыми, малыми количествами, проветриванием, хранением и запретом пробовать на вкус', async () => {
    const entries = await readJson<SeoCategoryText[]>('seo-category-texts.json')
    const reagents = entries.find((e) => e.slug === 'reagents')!
    expect(paragraphHtml(reagents)).toContain('<h2>Безопасность</h2>')
    const text = bodyText(reagents)
    for (const part of ['очк', 'перчатк', 'взросл', 'мал', 'проветр', 'недоступн', 'на вкус']) {
      expect(text, `reagents: нет «${part}»`).toContain(part)
    }
  })

  it('наборы, комбо и оборудование: упоминают взрослых и защитные очки', async () => {
    const entries = await readJson<SeoCategoryText[]>('seo-category-texts.json')
    for (const slug of ['kits', 'combo', 'equipment']) {
      const text = bodyText(entries.find((e) => e.slug === slug)!)
      expect(text, slug).toContain('взросл')
      expect(text, slug).toContain('очк')
    }
  })
})
