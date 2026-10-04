import 'reflect-metadata'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { BlogPost } from '../entities/BlogPost.js'
import { EntityRevision } from '../entities/EntityRevision.js'
import { Page } from '../entities/Page.js'
import { Product } from '../entities/Product.js'
import { ProductImage } from '../entities/ProductImage.js'
import { SiteSettings } from '../entities/SiteSettings.js'
import { createPgImageDb, migrateTildaImages } from './migrate-tilda-images.js'

const U1 = 'https://static.tildacdn.com/stor1111-2222-3333-4444-555566667777/one.png'
const U2 = 'https://static.tildacdn.com/tild2222-3333-4444-5555-666677778888/two.jpg'
const U3 = 'https://optim.tildacdn.com/tild3333-4444-5555-6666-777788889999/-/format/webp/x.webp'

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('db-test-png'),
])
const sha32 = (b: Buffer) => createHash('sha256').update(b).digest('hex').slice(0, 32)
const LOCAL = `/uploads/tilda/${sha32(PNG)}.png`

const fetchImpl = vi.fn(
  async () =>
    new Response(PNG as unknown as BodyInit, { headers: { 'content-type': 'image/png' } }),
)

describe('migrate-tilda-images на настоящем Postgres', () => {
  let dir: string

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'tilda-migrate-db-'))
    fetchImpl.mockClear()
    await AppDataSource.query(
      'TRUNCATE TABLE "products", "pages", "blog_posts", "entity_revisions", "site_settings" RESTART IDENTITY CASCADE',
    )
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  async function seed() {
    const product = await AppDataSource.getRepository(Product).save(
      AppDataSource.getRepository(Product).create({
        slug: 'kit',
        name: 'Набор',
        priceRub: 100,
        ogImage: U1,
        shortDescription: `Фото ${U2}`,
        longDescriptionBlocks: [{ type: 'paragraph', html: `<img src="${U1}">` }],
        translations: { en: { cover: U3 } },
      }),
    )
    await AppDataSource.getRepository(ProductImage).save([
      { productId: product.id, url: U1, alt: 'a', sortOrder: 1 },
      { productId: product.id, url: '/uploads/imported/x/0.png', alt: 'b', sortOrder: 2 },
    ])
    // Мягко удалённый товар тоже переносим: его могут восстановить.
    const deleted = await AppDataSource.getRepository(Product).save(
      AppDataSource.getRepository(Product).create({
        slug: 'old',
        name: 'Старый',
        priceRub: 1,
        ogImage: U2,
        deletedAt: new Date(),
      }),
    )
    const page = await AppDataSource.getRepository(Page).save(
      AppDataSource.getRepository(Page).create({
        slug: 'about',
        title: 'О нас',
        ogImage: U1,
        blocks: [{ type: 'image', url: U2, alt: '' }],
      }),
    )
    const post = await AppDataSource.getRepository(BlogPost).save(
      AppDataSource.getRepository(BlogPost).create({
        slug: 'post',
        title: 'Пост',
        coverImageUrl: U1,
        ogImage: U1,
        blocks: [{ type: 'image', url: U1, alt: '' }],
      }),
    )
    await AppDataSource.getRepository(EntityRevision).save(
      AppDataSource.getRepository(EntityRevision).create({
        entityType: 'page',
        entityId: page.id,
        snapshot: { blocks: [{ type: 'image', url: U1 }] },
      }),
    )
    await AppDataSource.getRepository(SiteSettings).save(
      AppDataSource.getRepository(SiteSettings).create({
        id: 'default',
        headerPromoText: `Акция ${U1}`,
        testimonials: [{ quote: 'ok', author: 'x', location: 'y' }],
      }),
    )
    return { product, deleted, page, post }
  }

  it('dry-run ничего не меняет в БД', async () => {
    const { product } = await seed()
    const report = await migrateTildaImages({
      db: createPgImageDb(AppDataSource),
      fetchImpl,
      uploadsDir: dir,
      apply: false,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(report.urls.map((u) => u.url).sort()).toEqual([U1, U2, U3].sort())
    const fresh = await AppDataSource.getRepository(Product).findOneByOrFail({ id: product.id })
    expect(fresh.ogImage).toBe(U1)
  })

  it('--apply переписывает все колонки с картинками, остальное не трогает', async () => {
    const { product, deleted, page, post } = await seed()
    const report = await migrateTildaImages({
      db: createPgImageDb(AppDataSource),
      fetchImpl,
      uploadsDir: dir,
      apply: true,
    })
    expect(report.counts).toMatchObject({ total: 3, downloaded: 3, failed: 0 })

    const p = await AppDataSource.getRepository(Product).findOneByOrFail({ id: product.id })
    expect(p.ogImage).toBe(LOCAL)
    expect(p.shortDescription).toBe(`Фото ${LOCAL}`)
    expect(p.longDescriptionBlocks).toEqual([{ type: 'paragraph', html: `<img src="${LOCAL}">` }])
    expect(p.translations).toEqual({ en: { cover: LOCAL } })

    const imgs = await AppDataSource.getRepository(ProductImage).find({
      where: { productId: product.id },
      order: { sortOrder: 'ASC' },
    })
    expect(imgs.map((i) => i.url)).toEqual([LOCAL, '/uploads/imported/x/0.png'])

    const d = await AppDataSource.getRepository(Product).findOneOrFail({
      where: { id: deleted.id },
      withDeleted: true,
    })
    expect(d.ogImage).toBe(LOCAL)

    const pg = await AppDataSource.getRepository(Page).findOneByOrFail({ id: page.id })
    expect(pg.ogImage).toBe(LOCAL)
    expect(pg.blocks).toEqual([{ type: 'image', url: LOCAL, alt: '' }])

    const bp = await AppDataSource.getRepository(BlogPost).findOneByOrFail({ id: post.id })
    expect(bp.coverImageUrl).toBe(LOCAL)
    expect(bp.ogImage).toBe(LOCAL)
    expect(bp.blocks).toEqual([{ type: 'image', url: LOCAL, alt: '' }])

    const rev = await AppDataSource.getRepository(EntityRevision).findOneByOrFail({
      entityId: page.id,
    })
    expect(rev.snapshot).toEqual({ blocks: [{ type: 'image', url: LOCAL }] })

    const settings = await AppDataSource.getRepository(SiteSettings).findOneByOrFail({
      id: 'default',
    })
    expect(settings.headerPromoText).toBe(`Акция ${LOCAL}`)
    expect(settings.testimonials).toEqual([{ quote: 'ok', author: 'x', location: 'y' }])
    // Служебная метка правки не должна «прыгать» от технического переноса.
    expect(p.updatedAt.getTime()).toBe(product.updatedAt.getTime())

    // Повторный прогон: в БД не осталось tildacdn, сеть не нужна.
    fetchImpl.mockClear()
    const again = await migrateTildaImages({
      db: createPgImageDb(AppDataSource),
      fetchImpl,
      uploadsDir: dir,
      apply: true,
    })
    expect(again.counts.total).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
