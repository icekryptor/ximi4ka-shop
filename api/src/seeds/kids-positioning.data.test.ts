// Сторож позиционирования 14+ для данных и сидов: тексты товаров, категорий, статей
// и CMS-страниц (api/data/*.json), а также строки в сидах (api/src/seeds/**/*.ts)
// без «для детей», возраста младше 14 и «вместе со взрослыми» вне формулы возраста.
// Правила — shared/src/content/kidsPositioning.ts, решение — план
// docs/superpowers/plans/2026-10-22-reposition-14-plus.md. Код витрины проверяет
// web/lib/kidsPositioning.guard.test.ts. Тест не трогает БД.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  findKidsPositioning,
  type KidsPositioningField,
} from '@ximi4ka-shop/shared/content/kidsPositioning'
import { visibleTexts } from '@ximi4ka-shop/shared/content/sourceTexts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(HERE, '../../data')

// Служебные поля: адреса, идентификаторы, внутренние заметки — посетитель их не видит.
const SKIP_KEYS = new Set([
  'url',
  'sourceUrl',
  'slug',
  'type',
  'buttonHref',
  'coverImageUrl',
  'tildaId',
  'sku',
  'categorySlug',
  'note',
])
// Заголовки и мета: здесь «набор юного химика» запрещён (решение Р3). shortDescription и
// excerpt уходят в description страницы, JSON-LD, RSS и Turbo — проверяем их так же строго.
const META_KEYS = new Set([
  'metaTitle',
  'metaDescription',
  'title',
  'name',
  'shortDescription',
  'excerpt',
])

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&laquo;': '«',
  '&raquo;': '»',
  '&mdash;': '—',
  '&ndash;': '–',
  '&quot;': '"',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
}
const plainText = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_e, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_e, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&[a-z]+;/g, (e) => ENTITIES[e] ?? ' ')

interface Problem {
  where: string
  rule: string
  match: string
}

function dataProblems(file: string): Problem[] {
  const out: Problem[] = []
  const walk = (value: unknown, where: string, key: string) => {
    if (typeof value === 'string') {
      if (SKIP_KEYS.has(key)) return
      const field: KidsPositioningField = META_KEYS.has(key) ? 'meta' : 'body'
      for (const hit of findKidsPositioning(plainText(value), field)) {
        out.push({ where, rule: hit.rule, match: hit.match })
      }
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${where}[${i}]`, key))
    } else if (value && typeof value === 'object') {
      const slug = (value as { slug?: unknown }).slug
      const base = typeof slug === 'string' ? `${where}{${slug}}` : where
      for (const [k, v] of Object.entries(value)) walk(v, `${base}.${k}`, k)
    }
  }
  walk(JSON.parse(readFileSync(path.join(DATA_DIR, file), 'utf-8')), file, '')
  return out
}

function seedFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) return seedFiles(p)
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [p] : []
  })
}

const format = (ps: Problem[]) => ps.map((p) => `${p.where} [${p.rule}] ${p.match}`)

describe('позиционирование 14+ в данных и сидах', () => {
  const dataFiles = readdirSync(DATA_DIR).filter(
    (f) => f.endsWith('.json') && f !== 'tilda-product-map.json',
  )

  it('находит файлы данных и сидов (иначе сторож прошёл бы вхолостую)', () => {
    expect(dataFiles).toEqual(
      expect.arrayContaining([
        'seo-product-texts.json',
        'tilda-catalog.json',
        'seo-category-texts.json',
        'seo-blog-drafts.json',
        'cms-pages.json',
      ]),
    )
    expect(seedFiles(HERE).map((f) => path.basename(f))).toEqual(
      expect.arrayContaining(['seed.ts', 'oge-card.ts']),
    )
  })

  it.each(dataFiles)('api/data/%s без детского позиционирования', (file) => {
    expect(format(dataProblems(file))).toEqual([])
  })

  it('строки сидов без детского позиционирования', () => {
    const problems: Problem[] = []
    for (const file of seedFiles(HERE)) {
      const rel = path.relative(HERE, file)
      for (const { text, line, field } of visibleTexts(readFileSync(file, 'utf-8'), file)) {
        for (const hit of findKidsPositioning(text, field)) {
          problems.push({ where: `${rel}:${line}`, rule: hit.rule, match: hit.match })
        }
      }
    }
    expect(format(problems)).toEqual([])
  })
})
