import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { ProductImage } from '../../entities/ProductImage.js'
import { BlogPost } from '../../entities/BlogPost.js'
import { createApp } from '../../app.js'

async function seedProduct(overrides: Partial<Product> = {}): Promise<Product> {
  const repo = AppDataSource.getRepository(Product)
  return repo.save(
    repo.create({
      slug: `kit-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Набор юного химика',
      sku: 'XIM-001',
      shortDescription: 'Опыты для детей',
      priceRub: 1500,
      stockStatus: 'in_stock',
      isPublished: true,
      longDescriptionBlocks: [],
      translations: {},
      ...overrides,
    }),
  )
}

async function seedPost(overrides: Partial<BlogPost> = {}): Promise<BlogPost> {
  const repo = AppDataSource.getRepository(BlogPost)
  return repo.save(
    repo.create({
      slug: `post-${Math.random().toString(36).slice(2, 10)}`,
      title: 'Почему пламя синее',
      blocks: [],
      translations: {},
      isPublished: true,
      publishedAt: new Date(),
      ...overrides,
    }),
  )
}

describe('GET /api/public/search', () => {
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
      'TRUNCATE product_images, products, blog_posts RESTART IDENTITY CASCADE',
    )
  })

  it('finds a product by part of its name (Cyrillic)', async () => {
    await seedProduct({ name: 'Набор Химичка 3.0', slug: 'himichka-30' })
    await seedProduct({ name: 'Слаймы и лизуны', slug: 'slizi' })

    const res = await request(app).get('/api/public/search').query({ q: 'химич' })

    expect(res.status).toBe(200)
    expect(res.body.data.products).toHaveLength(1)
    expect(res.body.data.products[0]).toMatchObject({
      slug: 'himichka-30',
      name: 'Набор Химичка 3.0',
      priceRub: 1500,
    })
    expect(res.body.data.posts).toEqual([])
  })

  it('is case-insensitive', async () => {
    await seedProduct({ name: 'Реактивы для опытов', slug: 'reagents' })

    const res = await request(app).get('/api/public/search').query({ q: 'РЕАКТИВЫ' })

    expect(res.status).toBe(200)
    expect(res.body.data.products).toHaveLength(1)
    expect(res.body.data.products[0].slug).toBe('reagents')
  })

  it('matches by sku and short_description too', async () => {
    await seedProduct({ name: 'Тайный набор', slug: 'secret', sku: 'ABC-999' })
    await seedProduct({
      name: 'Другой набор',
      slug: 'other',
      sku: null,
      shortDescription: 'Содержит магический порошок',
    })

    const bySku = await request(app).get('/api/public/search').query({ q: 'abc-999' })
    expect(bySku.body.data.products.map((p: { slug: string }) => p.slug)).toEqual(['secret'])

    const byDesc = await request(app).get('/api/public/search').query({ q: 'магическ' })
    expect(byDesc.body.data.products.map((p: { slug: string }) => p.slug)).toEqual(['other'])
  })

  it('returns the first image (by sortOrder) as the product thumbnail', async () => {
    const product = await seedProduct({ name: 'С картинками', slug: 'with-images' })
    const imageRepo = AppDataSource.getRepository(ProductImage)
    await imageRepo.save(
      imageRepo.create({ productId: product.id, url: 'https://cdn/second.png', alt: 'a', sortOrder: 2 }),
    )
    await imageRepo.save(
      imageRepo.create({ productId: product.id, url: 'https://cdn/first.png', alt: 'a', sortOrder: 1 }),
    )

    const res = await request(app).get('/api/public/search').query({ q: 'картинк' })
    expect(res.body.data.products[0].image).toBe('https://cdn/first.png')
  })

  it('returns null image when a product has no photos', async () => {
    await seedProduct({ name: 'Без фото', slug: 'no-photo' })
    const res = await request(app).get('/api/public/search').query({ q: 'фото' })
    expect(res.body.data.products[0].image).toBeNull()
  })

  it('finds blog posts by part of the title', async () => {
    await seedPost({ title: 'Почему небо голубое', slug: 'sky' })
    await seedPost({ title: 'История химии', slug: 'history' })

    const res = await request(app).get('/api/public/search').query({ q: 'небо' })
    expect(res.body.data.posts).toEqual([{ slug: 'sky', title: 'Почему небо голубое' }])
  })

  it('returns an empty result for a query shorter than 2 chars', async () => {
    await seedProduct({ name: 'Химичка', slug: 'x' })

    const res = await request(app).get('/api/public/search').query({ q: 'х' })
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ products: [], posts: [] })
  })

  it('returns an empty result for a missing query', async () => {
    const res = await request(app).get('/api/public/search')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ products: [], posts: [] })
  })

  it('does not return unpublished or soft-deleted products or posts', async () => {
    await seedProduct({ name: 'Черновик набора', slug: 'draft', isPublished: false })
    await seedProduct({ name: 'Удалённый набор', slug: 'gone', deletedAt: new Date() })
    await seedPost({ title: 'Черновик статьи', slug: 'draft-post', isPublished: false })

    const products = await request(app).get('/api/public/search').query({ q: 'набор' })
    expect(products.body.data.products).toEqual([])

    const posts = await request(app).get('/api/public/search').query({ q: 'черновик' })
    expect(posts.body.data.posts).toEqual([])
  })

  it('caps products at 6 results', async () => {
    for (let i = 0; i < 8; i++) {
      await seedProduct({ name: `Набор опытный ${i}`, slug: `bulk-${i}` })
    }
    const res = await request(app).get('/api/public/search').query({ q: 'опытный' })
    expect(res.body.data.products).toHaveLength(6)
  })
})
