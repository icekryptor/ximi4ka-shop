// Контракт данных api/data/seo-product-texts.json (черновики SEO-текстов,
// которые заливает seeds/import-seo-product-texts.ts): длины мета-тегов в
// лимитах, уникальность, осторожные формулировки, структура описаний и FAQ.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  META_DESCRIPTION_MAX,
  META_TITLE_MAX,
  type SeoProductText,
} from './_lib/seo-product-texts.js'

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data')

interface CatalogEntry {
  slug: string
  name: string
  metaTitle: string | null
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(path.join(DATA_DIR, file), 'utf-8')) as T
}

// Названия 10 приоритетных карточек (слаги из каталога).
const PRIORITY_SLUGS = [
  'sernaya-kislota',
  'azotnaya-kislota-10',
  'pipetka-pastera',
  'permanganat-kaliya',
  'shtativ-dlya-probirok-6-gnezd',
  'gidroksid-natriya',
  'nitrat-serebra',
  'fenolftalein',
  'himichka-30',
  'nabor-dlya-elektroliza',
]

// Формулировки, которых в SEO-текстах быть не должно: обещания, которых мы не
// можем подтвердить данными товара.
const FORBIDDEN: Array<[string, RegExp]> = [
  // «лучше» (сравнительная степень в советах) не запрещаем — только превосходное «лучший».
  ['лучший', /лучш(?:ий|ая|ее|ие|его|ей|ему|им|ими|ую|их)(?![а-яё])/i],
  ['гарантия', /гаранти/i],
  ['сертификат', /сертифиц/i],
  ['безопасно для детей', /безопасн\S*\s+для\s+дет/i],
  ['безопасный/безопасно', /безопасн(?:о|ый|ая|ое|ые|ых|ым|ой)(?![а-яё])/i],
]

function words(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
}

function allTexts(e: SeoProductText): string[] {
  return [
    e.metaTitle ?? '',
    e.metaDescription ?? '',
    ...(e.longDescription ?? []).map((b) => b.text),
    ...(e.faq ?? []).flatMap((f) => [f.question, f.answer]),
  ]
}

describe('data/seo-product-texts.json', () => {
  it('slug уникальны и существуют в каталоге, name совпадает с каталогом', async () => {
    const entries = await readJson<SeoProductText[]>('seo-product-texts.json')
    const catalog = await readJson<CatalogEntry[]>('tilda-catalog.json')
    const byslug = new Map(catalog.map((p) => [p.slug, p]))

    expect(new Set(entries.map((e) => e.slug)).size).toBe(entries.length)
    for (const e of entries) {
      expect(byslug.has(e.slug), `slug ${e.slug} не найден в tilda-catalog.json`).toBe(true)
      expect(e.name, e.slug).toBe(byslug.get(e.slug)!.name)
    }
  })

  it('покрывает весь каталог: metaDescription у всех, metaTitle у тех, у кого его нет', async () => {
    const entries = await readJson<SeoProductText[]>('seo-product-texts.json')
    const catalog = await readJson<CatalogEntry[]>('tilda-catalog.json')
    const bySlug = new Map(entries.map((e) => [e.slug, e]))

    for (const p of catalog) {
      const e = bySlug.get(p.slug)
      expect(e, `нет записи для ${p.slug}`).toBeDefined()
      expect(e!.metaDescription, `${p.slug}: metaDescription`).toBeTruthy()
      if (!p.metaTitle) expect(e!.metaTitle, `${p.slug}: metaTitle`).toBeTruthy()
    }
  })

  it('каждый текст помечен draft: true', async () => {
    const entries = await readJson<SeoProductText[]>('seo-product-texts.json')
    for (const e of entries) expect(e.draft, e.slug).toBe(true)
  })

  it(`metaTitle ≤ ${META_TITLE_MAX}, metaDescription ≤ ${META_DESCRIPTION_MAX} символов`, async () => {
    const entries = await readJson<SeoProductText[]>('seo-product-texts.json')
    for (const e of entries) {
      if (e.metaTitle !== undefined) {
        expect(e.metaTitle.length, `${e.slug}: metaTitle «${e.metaTitle}»`).toBeLessThanOrEqual(
          META_TITLE_MAX,
        )
        expect(e.metaTitle.trim(), e.slug).toBe(e.metaTitle)
      }
      if (e.metaDescription !== undefined) {
        expect(
          e.metaDescription.length,
          `${e.slug}: metaDescription «${e.metaDescription}»`,
        ).toBeLessThanOrEqual(META_DESCRIPTION_MAX)
        expect(e.metaDescription.trim(), e.slug).toBe(e.metaDescription)
      }
    }
  })

  it('metaTitle и metaDescription уникальны между товарами', async () => {
    const entries = await readJson<SeoProductText[]>('seo-product-texts.json')
    const titles = entries.flatMap((e) => (e.metaTitle ? [e.metaTitle.toLowerCase()] : []))
    const descriptions = entries.flatMap((e) =>
      e.metaDescription ? [e.metaDescription.toLowerCase()] : [],
    )
    expect(new Set(titles).size).toBe(titles.length)
    expect(new Set(descriptions).size).toBe(descriptions.length)
  })

  it('metaTitle у новых записей не дублирует уже существующие title каталога', async () => {
    const entries = await readJson<SeoProductText[]>('seo-product-texts.json')
    const catalog = await readJson<CatalogEntry[]>('tilda-catalog.json')
    const existing = new Set(
      catalog.flatMap((p) => (p.metaTitle ? [p.metaTitle.toLowerCase()] : [])),
    )
    for (const e of entries) {
      if (e.metaTitle) expect(existing.has(e.metaTitle.toLowerCase()), e.slug).toBe(false)
    }
  })

  it('в текстах нет запрещённых формулировок', async () => {
    const entries = await readJson<SeoProductText[]>('seo-product-texts.json')
    for (const e of entries) {
      for (const text of allTexts(e)) {
        for (const [label, re] of FORBIDDEN) {
          expect(re.test(text), `${e.slug}: «${label}» в «${text.slice(0, 60)}…»`).toBe(false)
        }
      }
    }
  })

  it('10 приоритетных карточек: описание 300–500 слов (heading + paragraph) и FAQ из 3–5 вопросов', async () => {
    const entries = await readJson<SeoProductText[]>('seo-product-texts.json')
    const withLong = entries.filter((e) => e.longDescription !== undefined)
    expect(withLong.map((e) => e.slug).sort()).toEqual([...PRIORITY_SLUGS].sort())

    for (const e of withLong) {
      const blocks = e.longDescription!
      expect(
        blocks.every((b) => b.type === 'heading' || b.type === 'paragraph'),
        e.slug,
      ).toBe(true)
      expect(
        blocks.some((b) => b.type === 'heading'),
        `${e.slug}: нет заголовков`,
      ).toBe(true)
      const count = words(blocks.map((b) => b.text).join(' '))
      expect(count, `${e.slug}: ${count} слов`).toBeGreaterThanOrEqual(300)
      expect(count, `${e.slug}: ${count} слов`).toBeLessThanOrEqual(500)

      const faq = e.faq ?? []
      expect(faq.length, `${e.slug}: вопросов в FAQ`).toBeGreaterThanOrEqual(3)
      expect(faq.length, `${e.slug}: вопросов в FAQ`).toBeLessThanOrEqual(5)
      for (const item of faq) {
        expect(item.question.trim().endsWith('?'), `${e.slug}: «${item.question}»`).toBe(true)
        expect(item.answer.trim().length, e.slug).toBeGreaterThan(20)
      }
      expect(new Set(faq.map((f) => f.question)).size).toBe(faq.length)
    }
  })

  it('описания реактивов-приоритетов упоминают защитные очки, перчатки и взрослых', async () => {
    const entries = await readJson<SeoProductText[]>('seo-product-texts.json')
    const reagents = [
      'sernaya-kislota',
      'azotnaya-kislota-10',
      'permanganat-kaliya',
      'gidroksid-natriya',
      'nitrat-serebra',
      'fenolftalein',
    ]
    for (const slug of reagents) {
      const text = (entries.find((e) => e.slug === slug)?.longDescription ?? [])
        .map((b) => b.text)
        .join(' ')
        .toLowerCase()
      expect(text, slug).toContain('очк')
      expect(text, slug).toContain('перчатк')
      expect(text, slug).toContain('взросл')
    }
  })

  it('заголовки описаний не совпадают с «Состав»/«Характеристики» (их забирают вкладки страницы товара)', async () => {
    const entries = await readJson<SeoProductText[]>('seo-product-texts.json')
    for (const e of entries) {
      for (const b of e.longDescription ?? []) {
        if (b.type === 'heading') {
          expect(/^(состав|что внутри|характеристики)$/i.test(b.text.trim()), e.slug).toBe(false)
        }
      }
    }
  })
})
