import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { ProductCategory } from '../../entities/ProductCategory.js'
import {
  applySeoCategoryTexts,
  planSeoCategoryFill,
  type SeoCategoryText,
} from './seo-category-texts.js'

const ENTRY: SeoCategoryText = {
  slug: 'reagents',
  name: 'Реактивы',
  draft: false,
  metaTitle: 'Химические реактивы для школьных опытов',
  metaDescription: 'Готовые растворы, индикаторы и металлы для школьных опытов.',
  seoBlocks: [
    { type: 'paragraph', html: '<h2>Какие реактивы есть</h2>' },
    { type: 'paragraph', html: '<p>Текст со <a href="/product/probirka">ссылкой</a>.</p>' },
    { type: 'faq', items: [{ question: 'Вопрос?', answer: 'Ответ.' }] },
  ],
}

describe('planSeoCategoryFill', () => {
  const empty = { metaTitle: null, metaDescription: null, seoBlocks: null }

  it('пустые поля (null, пробелы, []) попадают в patch', () => {
    const { patch, skipped } = planSeoCategoryFill(
      { metaTitle: '   ', metaDescription: null, seoBlocks: [] },
      ENTRY,
    )
    expect(Object.keys(patch).sort()).toEqual(['metaDescription', 'metaTitle', 'seoBlocks'])
    expect(patch.seoBlocks).toEqual(ENTRY.seoBlocks)
    expect(skipped).toEqual([])
  })

  it('непустые поля не трогает и сообщает о пропуске', () => {
    const { patch, skipped } = planSeoCategoryFill(
      {
        metaTitle: 'Свой title',
        metaDescription: 'Свой description',
        seoBlocks: [{ type: 'paragraph', html: '<p>Текст из админки</p>' }],
      },
      ENTRY,
    )
    expect(patch).toEqual({})
    expect(skipped).toEqual(['metaTitle', 'metaDescription', 'seoBlocks'])
  })

  it('поля, которых нет в записи данных, не попадают ни в patch, ни в skipped', () => {
    const { patch, skipped } = planSeoCategoryFill(empty, {
      slug: 'x',
      name: 'X',
      draft: false,
      metaDescription: 'Только description',
    })
    expect(patch).toEqual({ metaDescription: 'Только description' })
    expect(skipped).toEqual([])
  })

  it('patch не делится ссылкой с данными: правка копии не меняет запись', () => {
    const { patch } = planSeoCategoryFill(empty, ENTRY)
    ;(patch.seoBlocks as unknown[]).push({ type: 'paragraph', html: '<p>лишнее</p>' })
    expect(ENTRY.seoBlocks).toHaveLength(3)
  })
})

describe('applySeoCategoryTexts', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE TABLE "product_category_links", "product_categories" RESTART IDENTITY CASCADE',
    )
  })

  const repo = () => AppDataSource.getRepository(ProductCategory)

  async function createCategory(
    slug: string,
    extra: Partial<ProductCategory> = {},
  ): Promise<ProductCategory> {
    return repo().save(repo().create({ slug, name: slug, ...extra }))
  }

  it('заполняет пустые поля, и блоки проходят круг через jsonb без потерь', async () => {
    await createCategory('reagents')

    const report = await applySeoCategoryTexts(repo(), [ENTRY])

    const saved = await repo().findOneByOrFail({ slug: 'reagents' })
    expect(saved.metaTitle).toBe(ENTRY.metaTitle)
    expect(saved.metaDescription).toBe(ENTRY.metaDescription)
    // jsonb переставляет ключи, поэтому toEqual (порядок ключей не важен),
    // а не JSON.stringify.
    expect(saved.seoBlocks).toEqual(ENTRY.seoBlocks)
    expect(report.filled).toEqual([
      { slug: 'reagents', fields: ['metaTitle', 'metaDescription', 'seoBlocks'] },
    ])
    expect(report.untouched).toEqual([])
  })

  it('не перезаписывает непустые поля и не трогает остальные колонки', async () => {
    const existingBlocks = [{ type: 'paragraph', html: '<p>Текст из админки</p>' }]
    await createCategory('reagents', {
      metaTitle: 'Title из админки',
      metaDescription: 'Description из админки',
      seoBlocks: existingBlocks,
      sortOrder: 7,
      translations: { en: { name: 'Reagents' } },
    })

    const report = await applySeoCategoryTexts(repo(), [ENTRY])

    const saved = await repo().findOneByOrFail({ slug: 'reagents' })
    expect(saved.metaTitle).toBe('Title из админки')
    expect(saved.metaDescription).toBe('Description из админки')
    expect(saved.seoBlocks).toEqual(existingBlocks)
    expect(saved.sortOrder).toBe(7)
    expect(saved.translations).toEqual({ en: { name: 'Reagents' } })
    expect(report.filled).toEqual([])
    expect(report.untouched).toEqual([
      { slug: 'reagents', fields: ['metaTitle', 'metaDescription', 'seoBlocks'] },
    ])
  })

  it('заполняет только пустую часть: свой title остаётся, пустые поля заполняются', async () => {
    await createCategory('reagents', { metaTitle: 'Title из админки' })

    const report = await applySeoCategoryTexts(repo(), [ENTRY])

    const saved = await repo().findOneByOrFail({ slug: 'reagents' })
    expect(saved.metaTitle).toBe('Title из админки')
    expect(saved.metaDescription).toBe(ENTRY.metaDescription)
    expect(saved.seoBlocks).toEqual(ENTRY.seoBlocks)
    expect(report.filled).toEqual([{ slug: 'reagents', fields: ['metaDescription', 'seoBlocks'] }])
    expect(report.untouched).toEqual([{ slug: 'reagents', fields: ['metaTitle'] }])
  })

  it('идемпотентен: второй запуск ничего не меняет', async () => {
    await createCategory('reagents')
    await applySeoCategoryTexts(repo(), [ENTRY])
    const first = await repo().findOneByOrFail({ slug: 'reagents' })

    const second = await applySeoCategoryTexts(repo(), [ENTRY])

    expect(second.filled).toEqual([])
    expect(second.untouched).toHaveLength(1)
    const after = await repo().findOneByOrFail({ slug: 'reagents' })
    expect(after.seoBlocks).toEqual(first.seoBlocks)
    expect(after.metaTitle).toBe(first.metaTitle)
  })

  it('неизвестные slug пропускает с отчётом и не создаёт категорий', async () => {
    await createCategory('reagents')

    const report = await applySeoCategoryTexts(repo(), [{ ...ENTRY, slug: 'net-takoj' }, ENTRY])

    expect(report.unknown).toEqual(['net-takoj'])
    expect(report.filled.map((f) => f.slug)).toEqual(['reagents'])
    expect(await repo().count()).toBe(1)
  })

  it('черновики пропускает без includeDrafts и импортирует с ним', async () => {
    await createCategory('reagents')
    const draft = { ...ENTRY, draft: true }

    const skipped = await applySeoCategoryTexts(repo(), [draft])
    expect(skipped.drafts).toEqual(['reagents'])
    expect(skipped.filled).toEqual([])
    expect((await repo().findOneByOrFail({ slug: 'reagents' })).seoBlocks).toBeNull()

    const imported = await applySeoCategoryTexts(repo(), [draft], { includeDrafts: true })
    expect(imported.drafts).toEqual([])
    expect(imported.filled).toHaveLength(1)
    expect((await repo().findOneByOrFail({ slug: 'reagents' })).seoBlocks).toEqual(ENTRY.seoBlocks)
  })

  it('dry-run сообщает о заполнении, но ничего не пишет', async () => {
    await createCategory('reagents')

    const report = await applySeoCategoryTexts(repo(), [ENTRY], { dryRun: true })

    expect(report.filled).toEqual([
      { slug: 'reagents', fields: ['metaTitle', 'metaDescription', 'seoBlocks'] },
    ])
    const saved = await repo().findOneByOrFail({ slug: 'reagents' })
    expect(saved.metaTitle).toBeNull()
    expect(saved.metaDescription).toBeNull()
    expect(saved.seoBlocks).toBeNull()
  })
})
