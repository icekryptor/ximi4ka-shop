import { Router } from 'express'
import { Brackets, IsNull } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { ProductImage } from '../../entities/ProductImage.js'
import { CreateProductSchema, UpdateProductSchema, ListQuerySchema } from './products.schemas.js'
import { conflict, notFound } from '../errors.js'
import { requireAdminAuth, requireCsrfToken } from '../middleware/requireAdminAuth.js'
import { writeRevision } from '../../lib/revisions.js'

export const adminProductsRouter: Router = Router()

adminProductsRouter.use(requireAdminAuth)
adminProductsRouter.use(requireCsrfToken)

type ImageInput = { url: string; alt: string }

// Фото лежат в таблице product_images, а витрина читает именно её. Галерею
// заменяем целиком в той же транзакции, что и сохранение товара: иначе при
// сбое посередине товар остался бы без фото.
async function saveWithImages(entity: Product, images: ImageInput[] | undefined): Promise<Product> {
  return AppDataSource.transaction(async (manager) => {
    const saved = await manager.getRepository(Product).save(entity)
    if (images !== undefined) {
      const imageRepo = manager.getRepository(ProductImage)
      await imageRepo.delete({ productId: saved.id })
      if (images.length > 0) {
        await imageRepo.insert(
          images.map((img, i) => ({
            productId: saved.id,
            url: img.url,
            alt: img.alt,
            sortOrder: i,
          })),
        )
      }
    }
    return saved
  })
}

async function loadWithImages(id: string): Promise<Product | null> {
  const product = await AppDataSource.getRepository(Product).findOne({
    where: { id, deletedAt: IsNull() },
    relations: { images: true },
  })
  if (product) product.images = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder)
  return product
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  )
}

// List
adminProductsRouter.get('/', async (req, res, next) => {
  try {
    const { limit, offset, q } = ListQuerySchema.parse(req.query)
    const repo = AppDataSource.getRepository(Product)
    const qb = repo
      .createQueryBuilder('p')
      .where('p.deleted_at IS NULL')
      .orderBy('p.sort_order', 'ASC')
      .addOrderBy('p.created_at', 'DESC')
      .skip(offset)
      .take(limit)
    if (q) {
      qb.andWhere(
        new Brackets((qq) => {
          qq.where('p.name ILIKE :q', { q: `%${q}%` }).orWhere('p.sku ILIKE :q', { q: `%${q}%` })
        }),
      )
    }
    const [items, total] = await qb.getManyAndCount()
    res.json({ data: items, pagination: { limit, offset, total } })
  } catch (err) {
    next(err)
  }
})

// Get by id
adminProductsRouter.get('/:id', async (req, res, next) => {
  try {
    const product = await loadWithImages(req.params.id)
    if (!product) throw notFound('product_not_found', 'Product not found')
    res.json({ data: product })
  } catch (err) {
    next(err)
  }
})

// Create
adminProductsRouter.post('/', async (req, res, next) => {
  try {
    const { images, ...fields } = CreateProductSchema.parse(req.body)
    const repo = AppDataSource.getRepository(Product)
    const saved = await saveWithImages(repo.create(fields), images)
    // Snapshot the initial state so the revision history has a "t=0" row.
    await writeRevision('product', saved.id, req.adminUser?.id ?? null)
    res.status(201).json({ data: await loadWithImages(saved.id) })
  } catch (err) {
    if (isUniqueViolation(err)) {
      next(conflict('slug_conflict', 'A product with this slug already exists'))
      return
    }
    next(err)
  }
})

// Update
adminProductsRouter.patch('/:id', async (req, res, next) => {
  try {
    const { images, ...fields } = UpdateProductSchema.parse(req.body)
    const repo = AppDataSource.getRepository(Product)
    const existing = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!existing) throw notFound('product_not_found', 'Product not found')
    // Snapshot the prior state before mutating.
    await writeRevision('product', existing.id, req.adminUser?.id ?? null)
    const merged = repo.merge(existing, fields)
    const saved = await saveWithImages(merged, images)
    res.json({ data: await loadWithImages(saved.id) })
  } catch (err) {
    if (isUniqueViolation(err)) {
      next(conflict('slug_conflict', 'A product with this slug already exists'))
      return
    }
    next(err)
  }
})

// Publish
adminProductsRouter.post('/:id/publish', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Product)
    const existing = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!existing) throw notFound('product_not_found', 'Product not found')
    await writeRevision('product', existing.id, req.adminUser?.id ?? null)
    existing.isPublished = true
    const saved = await repo.save(existing)
    res.json({ data: saved })
  } catch (err) {
    next(err)
  }
})

// Unpublish
adminProductsRouter.post('/:id/unpublish', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Product)
    const existing = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!existing) throw notFound('product_not_found', 'Product not found')
    await writeRevision('product', existing.id, req.adminUser?.id ?? null)
    existing.isPublished = false
    const saved = await repo.save(existing)
    res.json({ data: saved })
  } catch (err) {
    next(err)
  }
})

// Soft delete
adminProductsRouter.delete('/:id', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Product)
    const existing = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!existing) throw notFound('product_not_found', 'Product not found')
    await writeRevision('product', existing.id, req.adminUser?.id ?? null)
    await repo.softRemove(existing)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
