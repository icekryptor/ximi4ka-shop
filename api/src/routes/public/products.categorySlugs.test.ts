import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { ProductCategory } from '../../entities/ProductCategory.js'
import { createApp } from '../../app.js'

describe('GET /api/public/products/:slug — categorySlugs', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE product_images, products, product_categories RESTART IDENTITY CASCADE',
    )
  })

  it('returns the slugs of the product categories, not the category objects', async () => {
    const products = AppDataSource.getRepository(Product)
    const product = await products.save(
      products.create({
        slug: 'probirka',
        name: 'Пробирка',
        sku: 'T-1',
        priceRub: 29,
        stockStatus: 'in_stock',
        isPublished: true,
        longDescriptionBlocks: [],
        translations: {},
      }),
    )
    const categories = AppDataSource.getRepository(ProductCategory)
    await categories.save(
      categories.create({
        slug: 'equipment',
        name: 'Оборудование',
        translations: {},
        products: [product],
      }),
    )

    const res = await request(app).get('/api/public/products/probirka')

    expect(res.status).toBe(200)
    expect(res.body.data.categorySlugs).toEqual(['equipment'])
    expect(res.body.data.categories).toBeUndefined()
  })

  it('returns an empty list for a product without categories', async () => {
    const products = AppDataSource.getRepository(Product)
    await products.save(
      products.create({
        slug: 'bare',
        name: 'Без категорий',
        sku: null,
        priceRub: 10,
        stockStatus: 'in_stock',
        isPublished: true,
        longDescriptionBlocks: [],
        translations: {},
      }),
    )

    const res = await request(app).get('/api/public/products/bare')

    expect(res.body.data.categorySlugs).toEqual([])
  })
})
