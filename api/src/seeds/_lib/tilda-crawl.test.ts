import { describe, it, expect } from 'vitest'
import {
  COMBO_SLUGS,
  SLUG_OVERRIDES,
  assertUniqueSlugs,
  cleanProductName,
  extractOgDescription,
  extractProductJson,
  parseProductsTsv,
  parseTildaPrice,
  parseTproductUrl,
  resolveCategorySlug,
  resolveProductSlug,
  textToParagraphBlocks,
} from './tilda-crawl.js'

describe('parseTproductUrl', () => {
  it('parses a category-prefixed tproduct URL', () => {
    expect(
      parseTproductUrl('https://ximi4ka.ru/catalog/reagents/tproduct/423044036992-nitrat-serebra'),
    ).toEqual({ tildaId: '423044036992', slug: 'nitrat-serebra' })
  })

  it('parses a prefix-less tproduct URL', () => {
    expect(parseTproductUrl('https://ximi4ka.ru/tproduct/279167718312-himichka-30')).toEqual({
      tildaId: '279167718312',
      slug: 'himichka-30',
    })
  })

  it('tolerates a trailing slash', () => {
    expect(parseTproductUrl('https://ximi4ka.ru/tproduct/279167718312-himichka-30/')).toEqual({
      tildaId: '279167718312',
      slug: 'himichka-30',
    })
  })

  it('returns null for non-tproduct URLs', () => {
    expect(parseTproductUrl('https://ximi4ka.ru/catalog/kits')).toBeNull()
    expect(parseTproductUrl('')).toBeNull()
  })
})

describe('resolveProductSlug', () => {
  it('resolves the hlorid-kaltsiya collision by tilda id', () => {
    expect(resolveProductSlug({ tildaId: '931658942912', slug: 'hlorid-kaltsiya' })).toBe(
      'hlorid-kaltsiya-poroshok',
    )
    expect(resolveProductSlug({ tildaId: '330530345672', slug: 'hlorid-kaltsiya' })).toBe(
      'hlorid-kaltsiya-rastvor',
    )
  })

  it('expands the truncated mendeleev-table slug', () => {
    expect(
      resolveProductSlug({
        tildaId: '792180934872',
        slug: 'tablitsa-mendeleeva-i-tablitsa-rastvorim',
      }),
    ).toBe('tablitsa-mendeleeva-i-rastvorimosti')
  })

  it('keeps the raw slug when no override exists', () => {
    expect(resolveProductSlug({ tildaId: '423044036992', slug: 'nitrat-serebra' })).toBe(
      'nitrat-serebra',
    )
  })

  it('has an override for every id in SLUG_OVERRIDES', () => {
    expect(Object.keys(SLUG_OVERRIDES)).toHaveLength(3)
  })
})

describe('resolveCategorySlug', () => {
  it('maps /catalog/<cat>/ URL prefixes to category slugs', () => {
    expect(
      resolveCategorySlug(
        'https://ximi4ka.ru/catalog/reagents/tproduct/423044036992-nitrat-serebra',
        'nitrat-serebra',
      ),
    ).toBe('reagents')
    expect(
      resolveCategorySlug(
        'https://ximi4ka.ru/catalog/equipment/tproduct/773905414092-probirka',
        'probirka',
      ),
    ).toBe('equipment')
    expect(
      resolveCategorySlug(
        'https://ximi4ka.ru/catalog/print/tproduct/576829950492-himichka-metodichka',
        'himichka-metodichka',
      ),
    ).toBe('print')
  })

  it('maps prefix-less combo slugs to combo', () => {
    for (const slug of COMBO_SLUGS) {
      expect(resolveCategorySlug(`https://ximi4ka.ru/tproduct/1-${slug}`, slug)).toBe('combo')
    }
  })

  it('maps remaining prefix-less products to kits', () => {
    expect(
      resolveCategorySlug('https://ximi4ka.ru/tproduct/279167718312-himichka-30', 'himichka-30'),
    ).toBe('kits')
    expect(
      resolveCategorySlug(
        'https://ximi4ka.ru/tproduct/738024751502-bolshoi-nabor-dlya-oge',
        'bolshoi-nabor-dlya-oge',
      ),
    ).toBe('kits')
  })

  it('throws on an unknown catalog prefix', () => {
    expect(() =>
      resolveCategorySlug('https://ximi4ka.ru/catalog/unknown/tproduct/1-x', 'x'),
    ).toThrow(/unknown/i)
  })
})

describe('parseProductsTsv', () => {
  const line = [
    'https://ximi4ka.ru/tproduct/279167718312-himichka-30',
    'Набор химика для опытов Химичка 3.0 161 в 1',
    '3099.00',
    '',
    'InStock',
    'Описание',
  ].join('\t')

  it('parses url, name, integer price and stock', () => {
    const rows = parseProductsTsv(`${line}\n`)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      url: 'https://ximi4ka.ru/tproduct/279167718312-himichka-30',
      name: 'Набор химика для опытов Химичка 3.0 161 в 1',
      priceRub: 3099,
      stockRaw: 'InStock',
    })
  })

  it('skips blank lines', () => {
    expect(parseProductsTsv(`\n${line}\n\n`)).toHaveLength(1)
  })

  it('throws on a row with an unparseable price', () => {
    const bad = line.replace('3099.00', 'free')
    expect(() => parseProductsTsv(bad)).toThrow(/price/i)
  })
})

describe('parseTildaPrice', () => {
  it('parses plain and decimal prices', () => {
    expect(parseTildaPrice('3500')).toBe(3500)
    expect(parseTildaPrice('3099.00')).toBe(3099)
  })

  it('parses space-grouped and comma-decimal prices', () => {
    expect(parseTildaPrice('3 500.00')).toBe(3500)
    expect(parseTildaPrice('3500,00')).toBe(3500)
  })

  it('returns null for empty, zero and missing values', () => {
    expect(parseTildaPrice('')).toBeNull()
    expect(parseTildaPrice('0')).toBeNull()
    expect(parseTildaPrice(undefined)).toBeNull()
    expect(parseTildaPrice(null)).toBeNull()
  })

  it('returns null for garbage', () => {
    expect(parseTildaPrice('дорого')).toBeNull()
  })
})

describe('extractProductJson', () => {
  it('extracts the embedded `var product = {...}` object', () => {
    const html = [
      '<script>',
      'var product = {"uid":279167718312,"title":"Химичка 3.0","price":"3099.0000","priceold":"3500","gallery":[{"img":"https://static.tildacdn.com/a.png"}]};',
      '</script>',
    ].join('\n')
    const p = extractProductJson(html)
    expect(p).not.toBeNull()
    expect(p?.uid).toBe(279167718312)
    expect(p?.priceold).toBe('3500')
    expect(p?.gallery?.[0]?.img).toBe('https://static.tildacdn.com/a.png')
  })

  it('returns null when no product object is embedded', () => {
    expect(extractProductJson('<html><body>nope</body></html>')).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    expect(extractProductJson('var product = {broken;\n')).toBeNull()
  })
})

describe('extractOgDescription', () => {
  it('extracts og:description content', () => {
    const html = '<meta property="og:description" content="Готовый 1% раствор" />'
    expect(extractOgDescription(html)).toBe('Готовый 1% раствор')
  })

  it('decodes basic HTML entities', () => {
    const html = '<meta property="og:description" content="A &amp; B &quot;C&quot;" />'
    expect(extractOgDescription(html)).toBe('A & B "C"')
  })

  it('returns null when the tag is missing or empty', () => {
    expect(extractOgDescription('<html></html>')).toBeNull()
    expect(extractOgDescription('<meta property="og:description" content="" />')).toBeNull()
  })
})

describe('textToParagraphBlocks', () => {
  it('splits on double <br /> into paragraph blocks wrapped in <p>', () => {
    const blocks = textToParagraphBlocks('Первый абзац. <br /><br />Второй абзац.')
    expect(blocks).toEqual([
      { type: 'paragraph', html: '<p>Первый абзац.</p>' },
      { type: 'paragraph', html: '<p>Второй абзац.</p>' },
    ])
  })

  it('keeps single <br /> line breaks inside one paragraph', () => {
    const blocks = textToParagraphBlocks('Строка 1<br />Строка 2')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.html).toContain('Строка 1')
    expect(blocks[0]?.html).toContain('Строка 2')
    expect(blocks[0]?.html).toContain('<br')
  })

  it('drops empty chunks and trailing <br /> runs', () => {
    const blocks = textToParagraphBlocks('Текст.<br /><br />')
    expect(blocks).toEqual([{ type: 'paragraph', html: '<p>Текст.</p>' }])
  })

  it('sanitizes dangerous markup', () => {
    const blocks = textToParagraphBlocks('Ок<script>alert(1)</script>')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.html).not.toContain('script')
  })

  it('returns [] for null/undefined/empty text', () => {
    expect(textToParagraphBlocks(null)).toEqual([])
    expect(textToParagraphBlocks(undefined)).toEqual([])
    expect(textToParagraphBlocks('   ')).toEqual([])
  })
})

describe('assertUniqueSlugs', () => {
  it('passes for unique slugs', () => {
    expect(() => assertUniqueSlugs(['a', 'b', 'c'])).not.toThrow()
  })

  it('throws listing the duplicated slug', () => {
    expect(() => assertUniqueSlugs(['a', 'b', 'a'])).toThrow(/a/)
  })
})

describe('cleanProductName', () => {
  it('splits a SEO H1 into a clean name + metaTitle', () => {
    expect(
      cleanProductName('Купить сульфат алюминия 5%, 35 мл | Алюминий сернокислый для опытов'),
    ).toEqual({
      name: 'Сульфат алюминия 5%, 35 мл',
      metaTitle: 'Купить сульфат алюминия 5%, 35 мл | Алюминий сернокислый для опытов',
    })
  })

  it('nominativises accusative leading heads', () => {
    expect(
      cleanProductName('Купить серную кислоту 7%, 65 мл | Раствор серной кислоты для опытов').name,
    ).toBe('Серная кислота 7%, 65 мл')
    expect(
      cleanProductName('Купить азотную кислоту 10%, 65 мл | Азотная кислота ОСЧ для опытов').name,
    ).toBe('Азотная кислота 10%, 65 мл')
    expect(
      cleanProductName('Купить соляную кислоту 10%, 65 мл | Раствор соляной кислоты ХЧ').name,
    ).toBe('Соляная кислота 10%, 65 мл')
    expect(cleanProductName('Купить серу молотую 10-12 г | Сера техническая для опытов').name).toBe(
      'Сера молотая 10-12 г',
    )
    expect(cleanProductName('Купить железную вату 4-4,5 г | Железо металлическое для опытов').name).toBe(
      'Железная вата 4-4,5 г',
    )
  })

  it('leaves already-clean names untouched (metaTitle=null)', () => {
    expect(cleanProductName('Электрохимичка')).toEqual({ name: 'Электрохимичка', metaTitle: null })
    expect(cleanProductName('Чашка Петри')).toEqual({ name: 'Чашка Петри', metaTitle: null })
  })

  it('is idempotent: cleaning a clean name is a no-op', () => {
    const once = cleanProductName('Купить хлорид бария 3%, 35 мл | Барий хлористый (BaCl2)')
    const twice = cleanProductName(once.name)
    expect(twice.name).toBe(once.name)
    expect(twice.metaTitle).toBeNull()
  })

  it('does not treat a plain "Купить"-less pipe name as SEO', () => {
    expect(cleanProductName('Химичка | 3.0')).toEqual({ name: 'Химичка | 3.0', metaTitle: null })
  })
})
