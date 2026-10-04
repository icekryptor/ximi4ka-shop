import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import {
  applySeoProductTexts,
  buildLongDescriptionBlocks,
  planSeoFill,
  type SeoProductText,
} from './seo-product-texts.js'

const ENTRY: SeoProductText = {
  slug: 'sernaya-kislota',
  name: 'Серная кислота 7%, 65 мл',
  draft: false,
  metaTitle: 'Купить серную кислоту 7% | Химичка',
  metaDescription: 'Готовый 7% раствор серной кислоты для школьных опытов.',
  longDescription: [
    { type: 'heading', text: 'Что это за реактив' },
    { type: 'paragraph', text: 'Раствор H2SO4 & вода <для опытов>.' },
  ],
  faq: [{ question: 'Вопрос?', answer: 'Ответ.' }],
}

describe('buildLongDescriptionBlocks', () => {
  it('превращает heading/paragraph в paragraph-блоки с экранированным HTML, faq — в faq-блок', () => {
    expect(buildLongDescriptionBlocks(ENTRY)).toEqual([
      { type: 'paragraph', html: '<h2>Что это за реактив</h2>' },
      { type: 'paragraph', html: '<p>Раствор H2SO4 &amp; вода &lt;для опытов&gt;.</p>' },
      { type: 'faq', items: [{ question: 'Вопрос?', answer: 'Ответ.' }] },
    ])
  })

  it('без longDescription и faq возвращает пустой массив', () => {
    expect(buildLongDescriptionBlocks({ slug: 'x', name: 'X', draft: false })).toEqual([])
  })
})

describe('planSeoFill', () => {
  const empty = { metaTitle: null, metaDescription: null, longDescriptionBlocks: [] }

  it('пустые поля (null, пробелы, []) попадают в patch', () => {
    const { patch, skipped } = planSeoFill(
      { metaTitle: '   ', metaDescription: null, longDescriptionBlocks: [] },
      ENTRY,
    )
    expect(Object.keys(patch).sort()).toEqual([
      'longDescriptionBlocks',
      'metaDescription',
      'metaTitle',
    ])
    expect(skipped).toEqual([])
  })

  it('непустые поля не трогает и сообщает о пропуске', () => {
    const { patch, skipped } = planSeoFill(
      {
        metaTitle: 'Свой title',
        metaDescription: 'Свой description',
        longDescriptionBlocks: [{ type: 'paragraph', html: '<p>Старый текст</p>' }],
      },
      ENTRY,
    )
    expect(patch).toEqual({})
    expect(skipped.sort()).toEqual(['longDescriptionBlocks', 'metaDescription', 'metaTitle'])
  })

  it('с appendLongDescription дописывает блоки после существующих, не меняя их', () => {
    const existing = [{ type: 'paragraph', html: '<p>Старый текст</p>' }]
    const { patch } = planSeoFill({ ...empty, longDescriptionBlocks: existing }, ENTRY, {
      appendLongDescription: true,
    })
    expect(patch.longDescriptionBlocks).toEqual([...existing, ...buildLongDescriptionBlocks(ENTRY)])
  })

  it('с appendLongDescription не дописывает повторно, если SEO-текст уже есть', () => {
    const already = [...buildLongDescriptionBlocks(ENTRY)]
    const { patch, skipped } = planSeoFill({ ...empty, longDescriptionBlocks: already }, ENTRY, {
      appendLongDescription: true,
    })
    expect(patch).not.toHaveProperty('longDescriptionBlocks')
    expect(skipped).toEqual(['longDescriptionBlocks'])
  })

  it('поля, которых нет в записи данных, не попадают ни в patch, ни в skipped', () => {
    const { patch, skipped } = planSeoFill(empty, {
      slug: 'x',
      name: 'X',
      draft: false,
      metaDescription: 'Только description',
    })
    expect(patch).toEqual({ metaDescription: 'Только description' })
    expect(skipped).toEqual([])
  })
})

describe('applySeoProductTexts', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE TABLE "product_images", "product_category_links", "products" RESTART IDENTITY CASCADE',
    )
  })

  const repo = () => AppDataSource.getRepository(Product)

  async function createProduct(slug: string, extra: Partial<Product> = {}): Promise<Product> {
    return repo().save(
      repo().create({
        slug,
        name: slug,
        priceRub: 100,
        isPublished: true,
        longDescriptionBlocks: [],
        ...extra,
      }),
    )
  }

  it('заполняет пустые поля', async () => {
    await createProduct('sernaya-kislota')

    const report = await applySeoProductTexts(repo(), [ENTRY])

    const saved = await repo().findOneByOrFail({ slug: 'sernaya-kislota' })
    expect(saved.metaTitle).toBe(ENTRY.metaTitle)
    expect(saved.metaDescription).toBe(ENTRY.metaDescription)
    expect(saved.longDescriptionBlocks).toEqual(buildLongDescriptionBlocks(ENTRY))
    expect(report.filled).toEqual([
      {
        slug: 'sernaya-kislota',
        fields: ['metaTitle', 'metaDescription', 'longDescriptionBlocks'],
      },
    ])
  })

  it('не перезаписывает непустые поля и не трогает остальные колонки', async () => {
    const existingBlocks = [{ type: 'paragraph', html: '<p>Текст из админки</p>' }]
    await createProduct('sernaya-kislota', {
      metaTitle: 'Title из админки',
      metaDescription: 'Description из админки',
      longDescriptionBlocks: existingBlocks,
      shortDescription: 'Короткое описание',
    })

    const report = await applySeoProductTexts(repo(), [ENTRY])

    const saved = await repo().findOneByOrFail({ slug: 'sernaya-kislota' })
    expect(saved.metaTitle).toBe('Title из админки')
    expect(saved.metaDescription).toBe('Description из админки')
    expect(saved.longDescriptionBlocks).toEqual(existingBlocks)
    expect(saved.shortDescription).toBe('Короткое описание')
    expect(report.filled).toEqual([])
    expect(report.untouched).toEqual([
      {
        slug: 'sernaya-kislota',
        fields: ['metaTitle', 'metaDescription', 'longDescriptionBlocks'],
      },
    ])
  })

  it('заполняет только пустую часть, если часть полей уже есть', async () => {
    await createProduct('sernaya-kislota', { metaTitle: 'Title из админки' })

    const report = await applySeoProductTexts(repo(), [ENTRY])

    const saved = await repo().findOneByOrFail({ slug: 'sernaya-kislota' })
    expect(saved.metaTitle).toBe('Title из админки')
    expect(saved.metaDescription).toBe(ENTRY.metaDescription)
    expect(report.filled[0]?.fields).toEqual(['metaDescription', 'longDescriptionBlocks'])
  })

  it('неизвестный slug и мягко удалённый товар пропускает с отчётом', async () => {
    const deleted = await createProduct('udalennyi')
    await repo().softDelete({ id: deleted.id })
    await createProduct('sernaya-kislota')

    const report = await applySeoProductTexts(repo(), [
      { ...ENTRY, slug: 'net-takogo-slug' },
      { ...ENTRY, slug: 'udalennyi' },
      ENTRY,
    ])

    expect(report.unknown).toEqual(['net-takogo-slug', 'udalennyi'])
    expect(report.filled.map((f) => f.slug)).toEqual(['sernaya-kislota'])
  })

  it('черновики (draft: true) пропускает, пока не передан includeDrafts', async () => {
    await createProduct('sernaya-kislota')
    const draft = { ...ENTRY, draft: true }

    const skipped = await applySeoProductTexts(repo(), [draft])
    expect(skipped.drafts).toEqual(['sernaya-kislota'])
    expect(skipped.filled).toEqual([])
    expect((await repo().findOneByOrFail({ slug: 'sernaya-kislota' })).metaTitle).toBeNull()

    const imported = await applySeoProductTexts(repo(), [draft], { includeDrafts: true })
    expect(imported.drafts).toEqual([])
    expect(imported.filled).toHaveLength(1)
  })

  it('идемпотентен: второй запуск ничего не меняет', async () => {
    await createProduct('sernaya-kislota')
    await applySeoProductTexts(repo(), [ENTRY])
    const after1 = await repo().findOneByOrFail({ slug: 'sernaya-kislota' })

    const second = await applySeoProductTexts(repo(), [ENTRY])

    const after2 = await repo().findOneByOrFail({ slug: 'sernaya-kislota' })
    expect(second.filled).toEqual([])
    expect(after2.longDescriptionBlocks).toEqual(after1.longDescriptionBlocks)
    expect(after2.updatedAt.getTime()).toBe(after1.updatedAt.getTime())
  })

  it('dryRun считает план, но ничего не пишет', async () => {
    await createProduct('sernaya-kislota')

    const report = await applySeoProductTexts(repo(), [ENTRY], { dryRun: true })

    expect(report.filled).toHaveLength(1)
    const saved = await repo().findOneByOrFail({ slug: 'sernaya-kislota' })
    expect(saved.metaTitle).toBeNull()
    expect(saved.longDescriptionBlocks).toEqual([])
  })

  it('appendLongDescription дописывает SEO-текст к существующему описанию', async () => {
    const existingBlocks = [{ type: 'paragraph', html: '<p>Раствор серной кислоты 7% 65 мл</p>' }]
    await createProduct('sernaya-kislota', { longDescriptionBlocks: existingBlocks })

    await applySeoProductTexts(repo(), [ENTRY], { appendLongDescription: true })

    const saved = await repo().findOneByOrFail({ slug: 'sernaya-kislota' })
    expect(saved.longDescriptionBlocks).toEqual([
      ...existingBlocks,
      ...buildLongDescriptionBlocks(ENTRY),
    ])
  })
})
