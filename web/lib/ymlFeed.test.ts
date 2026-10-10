import { describe, it, expect } from 'vitest'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import { escapeXml, formatYmlDate, generateYmlXml, type ProductWithCategoryIds } from './ymlFeed'

const baseSettings = {
  ymlShopName: 'Ximi4ka',
  ymlCompany: 'Ximi4ka LLC',
  ymlUrl: 'https://ximi4ka.ru',
  ymlCurrency: 'RUB' as const,
  ymlDeliveryNote: null,
}

function makeProduct(overrides: Partial<ProductWithCategoryIds> = {}): ProductWithCategoryIds {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'nabor',
    sku: null,
    name: 'Набор',
    shortDescription: null,
    longDescriptionBlocks: [],
    priceRub: 1000,
    compareAtPriceRub: null,
    stockStatus: 'in_stock',
    isPublished: true,
    sortOrder: 0,
    metaTitle: null,
    metaDescription: null,
    ogImage: null,
    canonicalUrl: null,
    noindex: false,
    translations: {},
    images: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    categoryIds: [],
    ...overrides,
  }
}

function makeCategory(overrides: Partial<ProductCategory> = {}): ProductCategory {
  return {
    id: 'cat-1',
    slug: 'kits',
    name: 'Наборы',
    parentId: null,
    metaTitle: null,
    metaDescription: null,
    sortOrder: 0,
    translations: {},
    ...overrides,
  }
}

describe('escapeXml', () => {
  it('escapes the five predefined XML entities', () => {
    expect(escapeXml('<a href="x">&y</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;y&lt;/a&gt;')
    expect(escapeXml("it's")).toBe('it&apos;s')
  })

  it('leaves non-special characters untouched', () => {
    expect(escapeXml('Набор Юного Химика — 2 490 ₽')).toBe('Набор Юного Химика — 2 490 ₽')
  })
})

describe('formatYmlDate', () => {
  it('produces YYYY-MM-DD HH:mm in UTC', () => {
    const d = new Date('2026-04-20T09:07:00Z')
    expect(formatYmlDate(d)).toBe('2026-04-20 09:07')
  })
})

describe('generateYmlXml — structure', () => {
  it('includes the required yml_catalog, shop, currencies, categories, offers tags', () => {
    const xml = generateYmlXml({
      products: [makeProduct({ categoryIds: ['cat-1'] })],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
      now: new Date('2026-04-20T09:07:00Z'),
    })
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<!DOCTYPE yml_catalog SYSTEM "shops.dtd">')
    expect(xml).toContain('<yml_catalog date="2026-04-20 09:07">')
    expect(xml).toContain('<shop>')
    expect(xml).toContain('<name>Ximi4ka</name>')
    expect(xml).toContain('<company>Ximi4ka LLC</company>')
    expect(xml).toContain('<url>https://ximi4ka.ru</url>')
    expect(xml).toContain('<currencies>')
    expect(xml).toContain('<currency id="RUB" rate="1"/>')
    expect(xml).toContain('<categories>')
    expect(xml).toContain('<offers>')
    expect(xml).toMatch(/<\/yml_catalog>\s*$/)
  })

  it('falls back to default shop name and siteUrl when settings are missing', () => {
    const xml = generateYmlXml({
      products: [],
      categories: [],
      settings: {
        ymlShopName: null,
        ymlCompany: null,
        ymlUrl: null,
        ymlCurrency: 'RUB',
        ymlDeliveryNote: null,
      },
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<name>Химичка</name>')
    expect(xml).toContain('<company>Химичка</company>')
    expect(xml).toContain('<url>https://new.ximi4ka.ru</url>')
  })

  it('подставляет «Химичка» и вместо пустых строк в настройках', () => {
    const xml = generateYmlXml({
      products: [],
      categories: [],
      settings: { ...baseSettings, ymlShopName: '  ', ymlCompany: '' },
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<name>Химичка</name>')
    expect(xml).toContain('<company>Химичка</company>')
  })

  it('компания без значения берёт название магазина из настроек', () => {
    const xml = generateYmlXml({
      products: [],
      categories: [],
      settings: { ...baseSettings, ymlShopName: 'Мой магазин', ymlCompany: null },
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<company>Мой магазин</company>')
  })

  it('emits delivery-options when ymlDeliveryNote is set', () => {
    const xml = generateYmlXml({
      products: [],
      categories: [],
      settings: { ...baseSettings, ymlDeliveryNote: 'Доставка 3-7 дней' },
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<delivery-options>')
    expect(xml).toContain('description="Доставка 3-7 дней"')
  })
})

describe('generateYmlXml — category mapping', () => {
  it('assigns sequential integer ids starting at 1', () => {
    const xml = generateYmlXml({
      products: [],
      categories: [
        makeCategory({ id: 'uuid-a', name: 'A' }),
        makeCategory({ id: 'uuid-b', name: 'B' }),
      ],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<category id="1">A</category>')
    expect(xml).toContain('<category id="2">B</category>')
  })

  it('emits parentId attribute for nested categories', () => {
    const xml = generateYmlXml({
      products: [],
      categories: [
        makeCategory({ id: 'parent-uuid', name: 'Parent' }),
        makeCategory({ id: 'child-uuid', name: 'Child', parentId: 'parent-uuid' }),
      ],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<category id="1">Parent</category>')
    expect(xml).toContain('<category id="2" parentId="1">Child</category>')
  })
})

describe('generateYmlXml — offers', () => {
  it('maps the first product category uuid to the correct integer id', () => {
    const xml = generateYmlXml({
      products: [makeProduct({ id: 'p1', slug: 'p', categoryIds: ['cat-2', 'cat-1'] })],
      categories: [
        makeCategory({ id: 'cat-1', name: 'A' }),
        makeCategory({ id: 'cat-2', name: 'B' }),
      ],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    // cat-2 was the first linked category; should map to id=2.
    expect(xml).toContain('<categoryId>2</categoryId>')
  })

  it('marks in_stock as available="true" and out_of_stock as "false"', () => {
    const xml = generateYmlXml({
      products: [
        makeProduct({
          id: 'p-in',
          slug: 'p-in',
          stockStatus: 'in_stock',
          categoryIds: ['cat-1'],
        }),
        makeProduct({
          id: 'p-out',
          slug: 'p-out',
          stockStatus: 'out_of_stock',
          categoryIds: ['cat-1'],
        }),
      ],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<offer id="p-in" available="true">')
    expect(xml).toContain('<offer id="p-out" available="false">')
  })

  it('под заказ (preorder) — available="false"', () => {
    const xml = generateYmlXml({
      products: [makeProduct({ id: 'p-pre', stockStatus: 'preorder', categoryIds: ['cat-1'] })],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<offer id="p-pre" available="false">')
  })

  it('url оффера и относительные картинки строятся от переданного siteUrl', () => {
    const xml = generateYmlXml({
      products: [
        makeProduct({
          slug: 'nabor',
          images: [{ url: '/uploads/a.jpg', alt: '', sortOrder: 0 }] as never,
          categoryIds: ['cat-1'],
        }),
      ],
      categories: [makeCategory()],
      settings: { ...baseSettings, ymlUrl: null },
      siteUrl: 'https://ximi4ka.ru',
    })
    expect(xml).toContain('<url>https://ximi4ka.ru/product/nabor</url>')
    expect(xml).toContain('<picture>https://ximi4ka.ru/uploads/a.jpg</picture>')
    expect(xml).not.toContain('new.ximi4ka.ru')
  })

  it('skips products without a linked category', () => {
    const xml = generateYmlXml({
      products: [
        makeProduct({ id: 'p-orphan', slug: 'orphan', categoryIds: [] }),
        makeProduct({ id: 'p-ok', slug: 'ok', categoryIds: ['cat-1'] }),
      ],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).not.toContain('id="p-orphan"')
    expect(xml).toContain('id="p-ok"')
  })

  it('uses canonicalUrl when present, falls back to siteUrl/product/slug', () => {
    const xml = generateYmlXml({
      products: [
        makeProduct({
          id: 'p-canon',
          slug: 'slug-a',
          canonicalUrl: 'https://ximi4ka.ru/special/a',
          categoryIds: ['cat-1'],
        }),
        makeProduct({
          id: 'p-fall',
          slug: 'slug-b',
          canonicalUrl: null,
          categoryIds: ['cat-1'],
        }),
      ],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<url>https://ximi4ka.ru/special/a</url>')
    expect(xml).toContain('<url>https://new.ximi4ka.ru/product/slug-b</url>')
  })

  it('escapes product names with XML special chars', () => {
    const xml = generateYmlXml({
      products: [
        makeProduct({
          id: 'p',
          slug: 'p',
          name: 'Rock & Roll <Edition>',
          categoryIds: ['cat-1'],
        }),
      ],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<name>Rock &amp; Roll &lt;Edition&gt;</name>')
    expect(xml).not.toContain('<name>Rock & Roll <Edition></name>')
  })

  it('emits up to 10 pictures per offer', () => {
    const images = Array.from({ length: 12 }, (_, i) => ({
      id: `img-${i}`,
      productId: 'p',
      url: `https://cdn.example.com/${i}.jpg`,
      alt: `image ${i}`,
      sortOrder: i,
    }))
    const xml = generateYmlXml({
      products: [
        makeProduct({
          id: 'p',
          slug: 'p',
          images,
          categoryIds: ['cat-1'],
        }),
      ],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    const matches = xml.match(/<picture>/g) ?? []
    expect(matches.length).toBe(10)
    expect(xml).toContain('<picture>https://cdn.example.com/9.jpg</picture>')
    expect(xml).not.toContain('<picture>https://cdn.example.com/10.jpg</picture>')
  })

  it('делает абсолютными картинки из своего /uploads (после переезда с Tilda)', () => {
    const image = (url: string, i: number) => ({
      id: `img-${i}`,
      productId: 'p',
      url,
      alt: 'a',
      sortOrder: i,
    })
    const xml = generateYmlXml({
      products: [
        makeProduct({
          id: 'p',
          slug: 'p',
          images: [
            image('/uploads/tilda/0123abcd.png', 0),
            image('uploads/tilda/no-slash.png', 1),
            image('https://cdn.example.com/abs.jpg', 2),
          ],
          categoryIds: ['cat-1'],
        }),
      ],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<picture>https://new.ximi4ka.ru/uploads/tilda/0123abcd.png</picture>')
    expect(xml).toContain('<picture>https://new.ximi4ka.ru/uploads/tilda/no-slash.png</picture>')
    expect(xml).toContain('<picture>https://cdn.example.com/abs.jpg</picture>')
    expect(xml).not.toMatch(/<picture>(?!https?:\/\/)/)
  })

  it('uses shortDescription when available, else first paragraph plaintext', () => {
    const xml = generateYmlXml({
      products: [
        makeProduct({
          id: 'p-short',
          slug: 'p-short',
          shortDescription: 'Краткое описание',
          categoryIds: ['cat-1'],
        }),
        makeProduct({
          id: 'p-para',
          slug: 'p-para',
          shortDescription: null,
          longDescriptionBlocks: [
            { type: 'paragraph', html: '<p>First <strong>para</strong></p>' },
            { type: 'paragraph', html: '<p>Second</p>' },
          ],
          categoryIds: ['cat-1'],
        }),
      ],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<description>Краткое описание</description>')
    expect(xml).toContain('<description>First para</description>')
  })

  it('omits description element when no text source is available', () => {
    const xml = generateYmlXml({
      products: [
        makeProduct({
          id: 'p',
          slug: 'p',
          shortDescription: null,
          longDescriptionBlocks: [],
          categoryIds: ['cat-1'],
        }),
      ],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    // No <description> tag at all — legal YML, Yandex tolerates absence.
    expect(xml).not.toMatch(/<description>/)
  })
})

describe('escapeXml — недопустимые символы', () => {
  it('вырезает управляющие символы, запрещённые в XML 1.0', () => {
    expect(escapeXml('a\u0000b\u0008c\u000Bd\u001Fe')).toBe('abcde')
    // Таб, перевод строки и возврат каретки допустимы.
    expect(escapeXml('a\tb\nc\rd')).toBe('a\tb\nc\rd')
  })
})

describe('generateYmlXml — vendor, vendorCode, oldprice', () => {
  const gen = (overrides: Partial<ProductWithCategoryIds>) =>
    generateYmlXml({
      products: [makeProduct({ categoryIds: ['cat-1'], ...overrides })],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })

  it('всегда выводит vendor «Химичка»', () => {
    expect(gen({})).toContain('<vendor>Химичка</vendor>')
  })

  it('выводит vendorCode из sku и экранирует его', () => {
    expect(gen({ sku: 'XM-3.0 & <1>' })).toContain(
      '<vendorCode>XM-3.0 &amp; &lt;1&gt;</vendorCode>',
    )
  })

  it('не выводит vendorCode при пустом sku', () => {
    expect(gen({ sku: null })).not.toContain('<vendorCode>')
    expect(gen({ sku: '   ' })).not.toContain('<vendorCode>')
  })

  it('выводит oldprice, если старая цена выше текущей минимум на 5%', () => {
    const xml = gen({ priceRub: 1000, compareAtPriceRub: 1500 })
    expect(xml).toContain('<price>1000</price>\n      <oldprice>1500</oldprice>')
  })

  it('не выводит oldprice, если старой цены нет, она не выше текущей или скидка меньше 5%', () => {
    expect(gen({ priceRub: 1000, compareAtPriceRub: null })).not.toContain('<oldprice>')
    expect(gen({ priceRub: 1000, compareAtPriceRub: 1000 })).not.toContain('<oldprice>')
    expect(gen({ priceRub: 1000, compareAtPriceRub: 800 })).not.toContain('<oldprice>')
    expect(gen({ priceRub: 1000, compareAtPriceRub: 1040 })).not.toContain('<oldprice>')
  })

  it('не выдумывает barcode, param и sales_notes: данных для них нет', () => {
    const xml = gen({ sku: 'A', priceRub: 1000, compareAtPriceRub: 2000 })
    expect(xml).not.toMatch(/<barcode>|<param |<sales_notes>/)
  })

  it('соблюдает порядок элементов offer по спецификации', () => {
    const xml = gen({
      sku: 'A-1',
      priceRub: 1000,
      compareAtPriceRub: 2000,
      shortDescription: 'Описание',
      images: [{ id: 'i', productId: 'p', url: '/uploads/a.jpg', alt: '', sortOrder: 0 }],
    })
    // Только блок <offer>: <name> и <url> есть и у <shop>.
    const offer = xml.slice(xml.indexOf('<offer '))
    const order = [
      '<url>',
      '<price>',
      '<oldprice>',
      '<currencyId>',
      '<categoryId>',
      '<picture>',
      '<name>',
      '<vendor>',
      '<vendorCode>',
      '<description>',
    ].map((tag) => offer.indexOf(tag))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
})

describe('generateYmlXml — description без HTML и до 3000 символов', () => {
  const descOf = (overrides: Partial<ProductWithCategoryIds>) => {
    const xml = generateYmlXml({
      products: [makeProduct({ categoryIds: ['cat-1'], ...overrides })],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    return /<description>([\s\S]*?)<\/description>/.exec(xml)?.[1]
  }

  it('убирает теги из shortDescription и не экранирует дважды готовые сущности', () => {
    expect(descOf({ shortDescription: '<p>Соль &amp; <b>сода</b>&nbsp;и вода</p>' })).toBe(
      'Соль &amp; сода и вода',
    )
  })

  it('не принимает «<» и «>» в обычном тексте за теги', () => {
    expect(descOf({ shortDescription: 'pH < 7 и температура > 3' })).toBe(
      'pH &lt; 7 и температура &gt; 3',
    )
  })

  it('обрезает описание до 3000 символов', () => {
    const text = descOf({ shortDescription: 'ж'.repeat(5000) })!
    expect(text).toHaveLength(3000)
  })

  it('не рвёт суррогатные пары при обрезке', () => {
    const text = descOf({ shortDescription: '🧪'.repeat(3500) })!
    expect(Array.from(text)).toHaveLength(3000)
  })
})

describe('generateYmlXml — фолбэк описания из longDescriptionBlocks', () => {
  const descOf = (overrides: Partial<ProductWithCategoryIds>) => {
    const xml = generateYmlXml({
      products: [makeProduct({ categoryIds: ['cat-1'], ...overrides })],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    return /<description>([\s\S]*?)<\/description>/.exec(xml)?.[1]
  }

  it('shortDescription из одних пробелов и тегов не считается описанием — берётся текстовый блок', () => {
    expect(
      descOf({
        shortDescription: '<p> </p>',
        longDescriptionBlocks: [{ type: 'paragraph', html: '<p>Текст блока</p>' }],
      }),
    ).toBe('Текст блока')
  })

  it('пропускает нетекстовые блоки и пустые абзацы, берёт первый осмысленный', () => {
    expect(
      descOf({
        longDescriptionBlocks: [
          { type: 'image', url: '/a.jpg', alt: '' },
          { type: 'paragraph', html: '<p>&nbsp;</p>' },
          { type: 'paragraph', html: '<p>Первый <b>смысл</b></p>' },
          { type: 'paragraph', html: '<p>Второй</p>' },
        ],
      }),
    ).toBe('Первый смысл')
  })

  it('пропускает блоки со служебными заголовками «Состав» и «Характеристики»', () => {
    expect(
      descOf({
        longDescriptionBlocks: [
          {
            type: 'paragraph',
            html: '<h3>Характеристики</h3><ul><li><strong>Вес:</strong> 1 кг</li></ul>',
          },
          { type: 'paragraph', html: '<h2>Состав</h2><p>Соль, сода</p>' },
          { type: 'paragraph', html: '<p>Состав:</p>' },
          { type: 'paragraph', html: '<p>Настоящее описание</p>' },
        ],
      }),
    ).toBe('Настоящее описание')
  })

  it('пропускает блоки из одних заголовков: в описание попадает первый абзац, а не заголовок', () => {
    expect(
      descOf({
        longDescriptionBlocks: [
          { type: 'paragraph', html: '<h2>Что это такое</h2>' },
          { type: 'paragraph', html: '<p>Раствор фенолфталеина для опытов.</p>' },
          { type: 'paragraph', html: '<h2>Меры предосторожности</h2>' },
        ],
      }),
    ).toBe('Раствор фенолфталеина для опытов.')
  })

  it('заголовок внутри блока с абзацем в описание не попадает', () => {
    expect(
      descOf({
        longDescriptionBlocks: [
          { type: 'paragraph', html: '<h2>Что это такое</h2><p>Раствор для опытов.</p>' },
        ],
      }),
    ).toBe('Раствор для опытов.')
  })

  it('если после заголовков текста нет, описания нет', () => {
    expect(
      descOf({
        longDescriptionBlocks: [
          { type: 'paragraph', html: '<h2>Что это такое</h2>' },
          { type: 'paragraph', html: '<h3>Для каких опытов</h3>' },
        ],
      }),
    ).toBeUndefined()
  })

  it('без осмысленных блоков описания нет', () => {
    expect(
      descOf({
        longDescriptionBlocks: [
          { type: 'paragraph', html: '<h3>Состав</h3><p>Соль</p>' },
          { type: 'video', provider: 'youtube', videoId: 'x' },
        ],
      }),
    ).toBeUndefined()
  })

  it('режет описание из блока по границе слова до 3000 символов', () => {
    const text = descOf({
      longDescriptionBlocks: [{ type: 'paragraph', html: `<p>х ${'слово '.repeat(1000)}</p>` }],
    })!
    expect(text.length).toBeLessThanOrEqual(3000)
    expect(text.endsWith('слово')).toBe(true)
    expect(
      text
        .split(' ')
        .slice(1)
        .every((w) => w === 'слово'),
    ).toBe(true)
  })

  it('режет и shortDescription по границе слова', () => {
    const text = descOf({ shortDescription: 'abcdefgh '.repeat(600) })!
    expect(text.length).toBeLessThanOrEqual(3000)
    expect(text.split(' ').every((w) => w === 'abcdefgh')).toBe(true)
  })
})
