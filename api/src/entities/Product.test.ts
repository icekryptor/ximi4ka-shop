import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { Product } from './Product.js'
import { ProductImage } from './ProductImage.js'

describe('Product entity', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize()
    }
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy()
    }
  })

  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE TABLE "product_images", "product_category_links", "products" RESTART IDENTITY CASCADE'
    )
  })

  it('persists and retrieves a product round-trip', async () => {
    const repo = AppDataSource.getRepository(Product)
    const created = repo.create({
      slug: 'test-product',
      name: 'Test Product',
      priceRub: 1000,
      stockStatus: 'in_stock',
      isPublished: true,
      longDescriptionBlocks: [],
      translations: {},
    })
    const saved = await repo.save(created)
    expect(saved.id).toBeTruthy()

    const found = await repo.findOneByOrFail({ id: saved.id })
    expect(found.slug).toBe('test-product')
    expect(found.priceRub).toBe(1000)
    expect(found.stockStatus).toBe('in_stock')
    expect(found.isPublished).toBe(true)
  })

  it('persists a product with images via cascade-less insert', async () => {
    const productRepo = AppDataSource.getRepository(Product)
    const imageRepo = AppDataSource.getRepository(ProductImage)

    const product = await productRepo.save(
      productRepo.create({
        slug: 'prod-with-images',
        name: 'Product with Images',
        priceRub: 500,
        stockStatus: 'in_stock',
        isPublished: true,
        longDescriptionBlocks: [],
        translations: {},
      })
    )

    await imageRepo.save([
      imageRepo.create({ productId: product.id, url: 'https://ex.com/1.jpg', alt: 'one', sortOrder: 0 }),
      imageRepo.create({ productId: product.id, url: 'https://ex.com/2.jpg', alt: 'two', sortOrder: 1 }),
    ])

    const found = await productRepo.findOneOrFail({
      where: { id: product.id },
      relations: { images: true },
    })
    expect(found.images).toHaveLength(2)
    expect(found.images.map((i) => i.alt).sort()).toEqual(['one', 'two'])
  })
})
