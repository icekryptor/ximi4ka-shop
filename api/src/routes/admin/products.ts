import { Router } from 'express'
import { Brackets, In, IsNull } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { ProductImage } from '../../entities/ProductImage.js'
import { ProductCategory } from '../../entities/ProductCategory.js'
import { CreateProductSchema, UpdateProductSchema, ListQuerySchema } from './products.schemas.js'
import { badRequest, conflict, notFound } from '../errors.js'
import { requireAdminAuth, requireCsrfToken } from '../middleware/requireAdminAuth.js'
import { writeRevision } from '../../lib/revisions.js'

export const adminProductsRouter: Router = Router()

adminProductsRouter.use(requireAdminAuth)
adminProductsRouter.use(requireCsrfToken)

type ImageInput = { url: string; alt: string }

// Проверяет id категорий до записи: неизвестный id — 400, а не тихий пропуск,
// иначе админка показала бы «сохранено», а связь не появилась бы.
// Возвращает id без повторов в исходном порядке.
async function resolveCategoryIds(ids: string[] | undefined): Promise<string[] | undefined> {
  if (ids === undefined) return undefined
  const unique = [...new Set(ids)]
  if (unique.length === 0) return unique
  const found = await AppDataSource.getRepository(ProductCategory).find({
    select: { id: true },
    where: { id: In(unique) },
  })
  const known = new Set(found.map((c) => c.id))
  const missing = unique.filter((id) => !known.has(id))
  if (missing.length > 0) {
    throw badRequest('unknown_category', 'Unknown category id', { missing })
  }
  return unique
}

// Фото лежат в таблице product_images, а витрина читает именно её. Галерею
// и категории заменяем целиком в той же транзакции, что и сохранение товара:
// иначе при сбое посередине товар остался бы без фото или без категорий.
async function saveWithRelations(
  entity: Product,
  images: ImageInput[] | undefined,
  categoryIds: string[] | undefined,
): Promise<Product> {
  return AppDataSource.transaction(async (manager) => {
    const saved = await manager.getRepository(Product).save(entity)
    if (categoryIds !== undefined) {
      await manager.query('DELETE FROM product_category_links WHERE product_id = $1', [saved.id])
      if (categoryIds.length > 0) {
        await manager.query(
          'INSERT INTO product_category_links (product_id, category_id) SELECT $1, unnest($2::uuid[])',
          [saved.id, categoryIds],
        )
      }
    }
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

type AdminProductView = Omit<Product, 'categories'> & { categoryIds: string[] }

// Ответ админки: товар с галереей по порядку и плоским categoryIds вместо
// связанных сущностей — форма товара отмечает по нему категории.
async function loadForAdmin(id: string): Promise<AdminProductView | null> {
  const product = await AppDataSource.getRepository(Product).findOne({
    where: { id, deletedAt: IsNull() },
    relations: { images: true, categories: true },
  })
  if (!product) return null
  const { categories, ...rest } = product
  return {
    ...rest,
    images: [...rest.images].sort((a, b) => a.sortOrder - b.sortOrder),
    categoryIds: (categories ?? []).map((c) => c.id),
  }
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
    const { limit, offset, q, categoryId } = ListQuerySchema.parse(req.query)
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
    if (categoryId) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM product_category_links pcl WHERE pcl.product_id = p.id AND pcl.category_id = :categoryId)',
        { categoryId },
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
    const product = await loadForAdmin(req.params.id)
    if (!product) throw notFound('product_not_found', 'Product not found')
    res.json({ data: product })
  } catch (err) {
    next(err)
  }
})

// Create
adminProductsRouter.post('/', async (req, res, next) => {
  try {
    const { images, categoryIds, ...fields } = CreateProductSchema.parse(req.body)
    const categories = await resolveCategoryIds(categoryIds)
    const repo = AppDataSource.getRepository(Product)
    const saved = await saveWithRelations(repo.create(fields), images, categories)
    // Snapshot the initial state so the revision history has a "t=0" row.
    await writeRevision('product', saved.id, req.adminUser?.id ?? null)
    res.status(201).json({ data: await loadForAdmin(saved.id) })
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
    const { images, categoryIds, ...fields } = UpdateProductSchema.parse(req.body)
    const categories = await resolveCategoryIds(categoryIds)
    const repo = AppDataSource.getRepository(Product)
    const existing = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!existing) throw notFound('product_not_found', 'Product not found')
    // Snapshot the prior state before mutating.
    await writeRevision('product', existing.id, req.adminUser?.id ?? null)
    const merged = repo.merge(existing, fields)
    const saved = await saveWithRelations(merged, images, categories)
    res.json({ data: await loadForAdmin(saved.id) })
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
