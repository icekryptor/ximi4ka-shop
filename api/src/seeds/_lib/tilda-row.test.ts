import { describe, it, expect } from 'vitest'
import { parseTildaRow, deriveSlug, parseCategoryNames, parsePhotoUrls } from './tilda-row.js'
import type { TildaRow } from './csv-parse.js'

const baseRow: TildaRow = {
  Title: 'Химичка 3.0',
  Description: 'Основной набор',
  Text: '<p>Описание</p>',
  Photo: 'https://static.tildacdn.com/a.png https://static.tildacdn.com/b.png',
  Price: '3299.00',
  'Price Old': '3999.00',
  Category: 'Наборы для опытов;Новинки',
  SKU: '7V25',
  Url: 'https://ximi4ka.ru/catalog/kits/tproduct/279167718312-himichka-30',
  'SEO title': 'Химичка 3.0 — купить',
  'SEO descr': 'Описание для SEO',
  Brand: 'Химичка',
  Mark: 'SALE',
  'Characteristics:Возраст': '10-18',
  'Characteristics:Объем': '',
  'Tabs:1': '',
  'Tabs:2': '',
}

describe('deriveSlug', () => {
  it('uses the URL last segment, stripping numeric prefix', () => {
    expect(deriveSlug(baseRow)).toBe('himichka-30')
  })

  it('falls back to transliterated title when URL is empty', () => {
    expect(deriveSlug({ ...baseRow, Url: '' })).toBe('himichka-3-0')
  })

  it('falls back to title when URL last segment has no slug part', () => {
    const r = { ...baseRow, Url: 'https://example.com/foo/bar/123-' }
    // last segment "123-" → strip "123-" → empty → fall back
    expect(deriveSlug(r)).toBe('himichka-3-0')
  })

  it('handles trailing slash in URL', () => {
    const r = { ...baseRow, Url: 'https://x.ru/a/tproduct/42-test-slug/' }
    expect(deriveSlug(r)).toBe('test-slug')
  })
})

describe('parseCategoryNames', () => {
  it('splits on semicolons, trims, drops empties', () => {
    expect(parseCategoryNames('Реактивы; Новинки ;')).toEqual(['Реактивы', 'Новинки'])
  })

  it('returns empty array for blank input', () => {
    expect(parseCategoryNames('')).toEqual([])
  })
})

describe('parsePhotoUrls', () => {
  it('splits on whitespace and filters empties', () => {
    const out = parsePhotoUrls('https://a.com/1.png  https://a.com/2.png')
    expect(out).toEqual(['https://a.com/1.png', 'https://a.com/2.png'])
  })

  it('returns empty array for blank input', () => {
    expect(parsePhotoUrls('')).toEqual([])
  })
})

describe('parseTildaRow', () => {
  it('extracts core fields', () => {
    const out = parseTildaRow(baseRow)
    expect(out.name).toBe('Химичка 3.0')
    expect(out.slug).toBe('himichka-30')
    expect(out.priceRub).toBe(3299)
    expect(out.compareAtPriceRub).toBe(3999)
    expect(out.shortDescription).toBe('Основной набор')
    expect(out.metaTitle).toBe('Химичка 3.0 — купить')
    expect(out.metaDescription).toBe('Описание для SEO')
    expect(out.sku).toBe('7V25')
    expect(out.categoryNames).toEqual(['Наборы для опытов', 'Новинки'])
    expect(out.photoUrls).toHaveLength(2)
  })

  it('drops compareAtPriceRub when not higher than price', () => {
    const out = parseTildaRow({ ...baseRow, 'Price Old': '3299.00' })
    expect(out.compareAtPriceRub).toBeNull()
  })

  it('drops compareAtPriceRub when missing', () => {
    const out = parseTildaRow({ ...baseRow, 'Price Old': '' })
    expect(out.compareAtPriceRub).toBeNull()
  })

  it('rounds prices to integer rubles', () => {
    const out = parseTildaRow({ ...baseRow, Price: '3299.49', 'Price Old': '3999.99' })
    expect(out.priceRub).toBe(3299)
    expect(out.compareAtPriceRub).toBe(4000)
  })

  it('builds a paragraph block from sanitized Text', () => {
    const out = parseTildaRow(baseRow)
    expect(out.longDescriptionBlocks[0]).toMatchObject({ type: 'paragraph' })
    expect((out.longDescriptionBlocks[0] as { html: string }).html).toContain('<p>')
  })

  it('emits a Характеристики block when at least one characteristic is filled', () => {
    const out = parseTildaRow(baseRow)
    const blocks = out.longDescriptionBlocks
    const charBlock = blocks.find(
      (b): b is { type: 'paragraph'; html: string } =>
        b.type === 'paragraph' && b.html.includes('Характеристики'),
    )
    expect(charBlock).toBeDefined()
    expect(charBlock?.html).toContain('Возраст')
    expect(charBlock?.html).toContain('10-18')
    expect(charBlock?.html).not.toContain('Объем') // empty, skipped
  })

  it('omits the Характеристики block when all are empty', () => {
    const r = { ...baseRow, 'Characteristics:Возраст': '' }
    const out = parseTildaRow(r)
    const charBlock = out.longDescriptionBlocks.find(
      (b) => b.type === 'paragraph' && b.html.includes('Характеристики'),
    )
    expect(charBlock).toBeUndefined()
  })

  it('parses a Состав block from Tabs:2', () => {
    const r = {
      ...baseRow,
      'Tabs:2': 'info|#|Состав|#|<p>Серная кислота 5%</p>',
    }
    const out = parseTildaRow(r)
    const sostavBlock = out.longDescriptionBlocks.find(
      (b) => b.type === 'paragraph' && b.html.includes('Состав'),
    )
    expect(sostavBlock).toBeDefined()
    expect((sostavBlock as { html: string }).html).toContain('Серная кислота')
  })

  it('returns null when Title is missing', () => {
    expect(parseTildaRow({ ...baseRow, Title: '' })).toBeNull()
    expect(parseTildaRow({ ...baseRow, Title: '   ' })).toBeNull()
  })
})
