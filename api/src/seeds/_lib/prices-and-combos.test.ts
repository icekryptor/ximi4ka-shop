import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { StockStatus } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { ProductCategory } from '../../entities/ProductCategory.js'
import { ProductImage } from '../../entities/ProductImage.js'
import {
  applyPricesAndCombos,
  FOUR_KITS_SLUG,
  KIT_PRICES,
  ONE_OF_EACH_SKU,
  ONE_OF_EACH_SLUG,
} from './prices-and-combos.js'

const KITS: [slug: string, name: string, price: number, compareAt: number | null][] = [
  ['himichka-30', 'Химичка 3.0', 3099, 3500],
  ['elektrohimichka', 'Электрохимичка', 3099, 3400],
  ['mini-himichka', 'Мини-Химичка', 1699, 1800],
  ['bolshoi-nabor-dlya-oge', 'Набор для ОГЭ', 3490, 6000],
  ['vse-tri-nabora', 'Все три набора!', 6499, 6900],
]

describe('applyPricesAndCombos на настоящем Postgres', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE TABLE "products", "product_categories" RESTART IDENTITY CASCADE',
    )
  })

  const products = () => AppDataSource.getRepository(Product)

  async function category(slug: string): Promise<ProductCategory> {
    return AppDataSource.getRepository(ProductCategory).save({ slug, name: slug })
  }

  async function seedProduct(
    slug: string,
    fields: Partial<Product> = {},
    imageUrls: string[] = [],
  ): Promise<Product> {
    const p = await products().save({
      slug,
      name: slug,
      priceRub: 100,
      isPublished: true,
      ...fields,
    })
    for (const [i, url] of imageUrls.entries()) {
      await AppDataSource.getRepository(ProductImage).save({
        productId: p.id,
        url,
        alt: slug,
        sortOrder: i,
      })
    }
    return p
  }

  async function link(cat: ProductCategory, p: Product): Promise<void> {
    await AppDataSource.createQueryBuilder().relation(ProductCategory, 'products').of(cat).add(p.id)
  }

  async function seedCatalog(opts: { ogeStatus?: StockStatus } = {}) {
    const combo = await category('combo')
    const reagents = await category('reagents')
    for (const [slug, name, priceRub, compareAtPriceRub] of KITS) {
      await seedProduct(
        slug,
        {
          name,
          priceRub,
          compareAtPriceRub,
          sortOrder: slug === 'vse-tri-nabora' ? 30 : 1,
          stockStatus:
            slug === 'bolshoi-nabor-dlya-oge' ? (opts.ogeStatus ?? 'in_stock') : 'in_stock',
        },
        // Главное фото — с наименьшим sortOrder, второе в комбо не попадает.
        [`/uploads/${slug}/0.png`, `/uploads/${slug}/1.png`],
      )
    }
    await seedProduct(
      'zapas-vseh-reaktivov',
      { name: 'Запас всех реактивов', sku: 'RRR', priceRub: 7599, sortOrder: 40, weightG: 3000 },
      ['/uploads/zapas/0.png', '/uploads/zapas/1.png'],
    )
    // Реактивы: в сумму идут опубликованные, без «Трёх кислот».
    for (const [slug, priceRub, isPublished] of [
      ['sernaya-kislota', 2000, true],
      ['nitrat-serebra', 2500, true],
      ['tri-kisloti', 900, true],
      ['skrytyi', 700, false],
    ] as const) {
      await link(reagents, await seedProduct(slug, { priceRub, isPublished }))
    }
    return { combo }
  }

  async function bySlug(slug: string) {
    return products().findOneOrFail({
      where: { slug },
      relations: { images: true, categories: true },
    })
  }

  it('ставит новые цены наборов; зачёркнутая остаётся, только если она выше новой', async () => {
    await seedCatalog()
    const report = await applyPricesAndCombos(AppDataSource)

    for (const [slug, to] of Object.entries(KIT_PRICES)) {
      expect((await bySlug(slug)).priceRub).toBe(to)
    }
    expect((await bySlug('himichka-30')).compareAtPriceRub).toBe(3500)
    // 6900 ≤ 6990 — «скидка» вверх не показывается.
    expect((await bySlug('vse-tri-nabora')).compareAtPriceRub).toBeNull()
    expect(report.priceChanges).toContainEqual({
      slug: 'vse-tri-nabora',
      from: 6499,
      to: 6990,
      compareAtFrom: 6900,
      compareAtTo: null,
    })
  })

  it('заводит «Все четыре набора»: цена, состав, фото наборов, коробки, категория «Комбо», черновик', async () => {
    await seedCatalog()
    await applyPricesAndCombos(AppDataSource)

    const four = await bySlug(FOUR_KITS_SLUG)
    expect(four.name).toBe('Все четыре набора')
    expect(four.priceRub).toBe(9330)
    expect(four.compareAtPriceRub).toBe(3190 + 3190 + 1699 + 3590)
    expect(four.isPublished).toBe(false)
    expect(four.stockStatus).toBe('in_stock')
    expect(four.shipBoxes).toEqual(['large', 'elektro', 'medium', 'large'])
    expect(four.weightG).toBe(4600)
    expect(four.categories.map((c) => c.slug)).toEqual(['combo'])
    expect(four.sortOrder).toBe(30)
    const html = JSON.stringify(four.longDescriptionBlocks)
    expect(html).toContain('<h3>Состав</h3>')
    for (const name of ['Химичка 3.0', 'Электрохимичка', 'Мини-Химичка', 'Набор для ОГЭ']) {
      expect(html).toContain(`<li>${name}</li>`)
    }
    const images = [...four.images].sort((a, b) => a.sortOrder - b.sortOrder)
    expect(images.map((i) => i.url)).toEqual([
      '/uploads/himichka-30/0.png',
      '/uploads/elektrohimichka/0.png',
      '/uploads/mini-himichka/0.png',
      '/uploads/bolshoi-nabor-dlya-oge/0.png',
    ])
    expect(four.ogImage).toBe('/uploads/himichka-30/0.png')
  })

  it('заводит «Все реактивы по 1 шт»: артикул RRR1, фото «Запаса», половина веса, сумма реактивов', async () => {
    await seedCatalog()
    await applyPricesAndCombos(AppDataSource, { publish: true })

    const one = await bySlug(ONE_OF_EACH_SLUG)
    expect(one.sku).toBe(ONE_OF_EACH_SKU)
    expect(one.name).toBe('Все реактивы по 1 шт')
    expect(one.priceRub).toBe(3990)
    expect(one.compareAtPriceRub).toBe(2000 + 2500)
    expect(one.isPublished).toBe(true)
    expect(one.longDescriptionBlocks).toEqual([])
    expect(one.weightG).toBe(1500)
    expect(one.looseUnits).toBe(16)
    expect(one.categories.map((c) => c.slug)).toEqual(['combo'])
    expect(one.images.map((i) => i.url).sort()).toEqual([
      '/uploads/zapas/0.png',
      '/uploads/zapas/1.png',
    ])
  })

  it('комбо с набором «под заказ» тоже «под заказ»', async () => {
    await seedCatalog({ ogeStatus: 'preorder' })
    await applyPricesAndCombos(AppDataSource)
    expect((await bySlug(FOUR_KITS_SLUG)).stockStatus).toBe('preorder')
  })

  it('идемпотентен: повторный запуск не плодит товары и фото, правит только цену', async () => {
    await seedCatalog()
    await applyPricesAndCombos(AppDataSource)
    await products().update({ slug: FOUR_KITS_SLUG }, { priceRub: 1, name: 'Правка из админки' })

    const report = await applyPricesAndCombos(AppDataSource)

    expect(await products().count({ where: { slug: FOUR_KITS_SLUG } })).toBe(1)
    const four = await bySlug(FOUR_KITS_SLUG)
    expect(four.priceRub).toBe(9330)
    expect(four.name).toBe('Правка из админки')
    expect(four.images).toHaveLength(4)
    expect(report.combos.map((c) => c.action)).toEqual(['price-updated', 'price-updated'])
  })

  it('dry-run ничего не пишет, но показывает план', async () => {
    await seedCatalog()
    const report = await applyPricesAndCombos(AppDataSource, { dryRun: true })

    expect((await bySlug('himichka-30')).priceRub).toBe(3099)
    expect(await products().count({ where: { slug: FOUR_KITS_SLUG } })).toBe(0)
    expect(report.priceChanges).toHaveLength(5)
    expect(report.combos.map((c) => [c.slug, c.action])).toEqual([
      [FOUR_KITS_SLUG, 'created'],
      [ONE_OF_EACH_SLUG, 'created'],
    ])
  })

  it('без набора в БД падает целиком, ничего не записав', async () => {
    await seedCatalog()
    await products().softDelete({ slug: 'mini-himichka' })

    await expect(applyPricesAndCombos(AppDataSource)).rejects.toThrow('mini-himichka')
    expect((await bySlug('himichka-30')).priceRub).toBe(3099)
  })
})
