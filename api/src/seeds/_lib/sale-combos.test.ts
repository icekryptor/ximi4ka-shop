import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { ProductCategory } from '../../entities/ProductCategory.js'
import { linkSaleCombos } from './sale-combos.js'

describe('linkSaleCombos на настоящем Postgres', () => {
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

  const seed = (slug: string) =>
    AppDataSource.getRepository(Product).save({
      slug,
      name: slug,
      priceRub: 100,
      isPublished: true,
    })

  async function comboSlugs(): Promise<string[]> {
    const c = await AppDataSource.getRepository(ProductCategory).findOneOrFail({
      where: { slug: 'combo' },
      relations: { products: true },
    })
    return c.products.map((p) => p.slug).sort()
  }

  it('кладёт оба комбо в категорию и не дублирует при повторе', async () => {
    await AppDataSource.getRepository(ProductCategory).save({ slug: 'combo', name: 'Комбо' })
    await seed('all-4-kits')
    await seed('zapas-reaktivov-1')

    const first = await linkSaleCombos(AppDataSource)
    expect(first.map((r) => r.action)).toEqual(['linked', 'linked'])
    expect(await comboSlugs()).toEqual(['all-4-kits', 'zapas-reaktivov-1'])

    const second = await linkSaleCombos(AppDataSource)
    expect(second.map((r) => r.action)).toEqual(['already-linked', 'already-linked'])
    expect(await comboSlugs()).toEqual(['all-4-kits', 'zapas-reaktivov-1'])
  })

  it('dry-run ничего не пишет, отсутствующий товар помечает missing', async () => {
    await AppDataSource.getRepository(ProductCategory).save({ slug: 'combo', name: 'Комбо' })
    await seed('all-4-kits')

    const report = await linkSaleCombos(AppDataSource, { dryRun: true })
    expect(report).toEqual([
      { slug: 'all-4-kits', action: 'linked' },
      { slug: 'zapas-reaktivov-1', action: 'missing' },
    ])
    expect(await comboSlugs()).toEqual([])
  })
})
