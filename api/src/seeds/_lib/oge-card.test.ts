import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { ProductImage } from '../../entities/ProductImage.js'
import {
  applyOgeCard,
  buildOgeLongDescription,
  OGE_COMPOSITION,
  OGE_IMAGES,
  OGE_META_DESCRIPTION,
  OGE_REAGENTS_COUNT,
  OGE_SHORT_DESCRIPTION,
  OGE_SLUG,
} from './oge-card.js'

const paragraphHtml = (blocks: ReturnType<typeof buildOgeLongDescription>) =>
  blocks.flatMap((b) => (b.type === 'paragraph' ? [b.html] : []))

describe('данные карточки «Химичка ОГЭ»', () => {
  it('29 реактивов (как на коробке) и 2 индикатора — всего 31 позиция состава', () => {
    expect(OGE_REAGENTS_COUNT).toBe(29)
    const all = OGE_COMPOSITION.reduce((n, g) => n + g.items.length, 0)
    expect(all).toBe(31)
  })

  it('мета-описание укладывается в 160 символов, цифры совпадают с коробкой', () => {
    expect(OGE_META_DESCRIPTION.length).toBeLessThanOrEqual(160)
    for (const text of [OGE_META_DESCRIPTION, OGE_SHORT_DESCRIPTION]) {
      expect(text).toContain('29 реактивов')
      expect(text).toContain('110+')
      expect(text).not.toContain('31 реактив')
    }
  })

  it('все блоки проходят isBlock; «Состав» и «Характеристики» — в формате, который читает витрина', () => {
    const blocks = buildOgeLongDescription()
    expect(blocks.every(isBlock)).toBe(true)
    const html = paragraphHtml(blocks)
    const contents = html.find((h) => /<h3[^>]*>\s*Состав\s*<\/h3>/i.test(h))
    const chars = html.find((h) => /<h3[^>]*>\s*Характеристики\s*<\/h3>/i.test(h))
    expect(contents).toBeDefined()
    expect(chars).toBeDefined()
    // 31 позиция состава + 6 предметов оборудования.
    expect((contents!.match(/<li>/g) ?? []).length).toBe(31 + 6)
    // parseCharacteristics ждёт <li><strong>Ключ:</strong> Значение</li>.
    expect(chars).toMatch(/<li><strong>Реактивов в наборе:<\/strong> 29<\/li>/)
  })

  it('формулы получают индексы, кириллица в формулах не просочилась', () => {
    const contents = paragraphHtml(buildOgeLongDescription()).find((h) => h.includes('<h3>Состав'))!
    expect(contents).toContain('Al<sub>2</sub>(SO<sub>4</sub>)<sub>3</sub>')
    expect(contents).toContain('H<sub>2</sub>O<sub>2</sub>')
    expect(contents).toContain('<strong>HCl</strong>')
  })

  it('в тексте нет упоминаний 31 реактива и есть блок FAQ', () => {
    const blocks = buildOgeLongDescription()
    expect(JSON.stringify(blocks)).not.toContain('31 реактив')
    expect(blocks.some((b) => b.type === 'faq')).toBe(true)
  })
})

describe('applyOgeCard на настоящем Postgres', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE TABLE "products" RESTART IDENTITY CASCADE')
  })

  async function seedOldCard() {
    const product = await AppDataSource.getRepository(Product).save({
      slug: OGE_SLUG,
      name: 'Химичка ОГЭ',
      priceRub: 3490,
      shortDescription: 'старое «31 реактив»',
      metaDescription: 'старое 31 реактив',
      longDescriptionBlocks: [
        { type: 'paragraph', html: '<p>Реактивы в наборе: <br><ul><li></li></ul></p>' },
      ],
    })
    await AppDataSource.getRepository(ProductImage).save([
      { productId: product.id, url: '/uploads/tilda/old1.png', alt: 'старая 1', sortOrder: 1 },
      { productId: product.id, url: '/uploads/tilda/old2.png', alt: 'старая 2', sortOrder: 2 },
    ])
    return product
  }

  async function readCard() {
    return AppDataSource.getRepository(Product).findOneOrFail({
      where: { slug: OGE_SLUG },
      relations: { images: true },
    })
  }

  it('заменяет фото по порядку и обновляет описание; возвращает старые значения для отката', async () => {
    await seedOldCard()
    const report = await applyOgeCard(AppDataSource)

    expect(report.before.images.map((i) => i.url)).toEqual([
      '/uploads/tilda/old1.png',
      '/uploads/tilda/old2.png',
    ])
    expect(report.before.shortDescription).toContain('31')

    const card = await readCard()
    const images = [...card.images].sort((a, b) => a.sortOrder - b.sortOrder)
    expect(images.map((i) => i.url)).toEqual(OGE_IMAGES.map((i) => i.url))
    expect(images.map((i) => i.sortOrder)).toEqual([1, 2])
    expect(card.shortDescription).toBe(OGE_SHORT_DESCRIPTION)
    expect(card.metaDescription).toBe(OGE_META_DESCRIPTION)
    expect(card.longDescriptionBlocks).toEqual(buildOgeLongDescription())
    // Остальное не трогаем.
    expect(card.name).toBe('Химичка ОГЭ')
    expect(card.priceRub).toBe(3490)
  })

  it('идемпотентен: повторный запуск не плодит фото', async () => {
    await seedOldCard()
    await applyOgeCard(AppDataSource)
    await applyOgeCard(AppDataSource)
    const card = await readCard()
    expect(card.images).toHaveLength(OGE_IMAGES.length)
  })

  it('dry-run ничего не пишет', async () => {
    await seedOldCard()
    const report = await applyOgeCard(AppDataSource, { dryRun: true })
    expect(report.dryRun).toBe(true)
    const card = await readCard()
    expect(card.images.map((i) => i.url).sort()).toEqual([
      '/uploads/tilda/old1.png',
      '/uploads/tilda/old2.png',
    ])
    expect(card.shortDescription).toBe('старое «31 реактив»')
  })

  it('без товара в БД падает с понятной ошибкой и ничего не создаёт', async () => {
    await expect(applyOgeCard(AppDataSource)).rejects.toThrow(OGE_SLUG)
    expect(await AppDataSource.getRepository(ProductImage).count()).toBe(0)
  })
})
