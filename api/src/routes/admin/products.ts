import { Router } from 'express'
import { Brackets, In, IsNull, type EntityManager } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { ProductCategory } from '../../entities/ProductCategory.js'
import { CreateProductSchema, UpdateProductSchema, ListQuerySchema } from './products.schemas.js'
import { badRequest, conflict, notFound } from '../errors.js'
import { requireAdminAuth, requireCsrfToken } from '../middleware/requireAdminAuth.js'
import { writeRevision } from '../../lib/revisions.js'

export const adminProductsRouter: Router = Router()

adminProductsRouter.use(requireAdminAuth)
adminProductsRouter.use(requireCsrfToken)

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  )
}

// Админке нужны только id категорий — сами строки (с SEO-текстами) в ответ не
// кладём, как и в публичном списке.
function withCategoryIds(
  product: Product,
): Omit<Product, 'categories'> & { categoryIds: string[] } {
  const { categories, ...columns } = product
  return { ...columns, categoryIds: (categories ?? []).map((c) => c.id) }
}

async function loadCategories(manager: EntityManager, ids: string[]): Promise<ProductCategory[]> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return []
  const categories = await manager.getRepository(ProductCategory).findBy({ id: In(unique) })
  if (categories.length !== unique.length) {
    throw badRequest('unknown_category', 'One or more categories do not exist')
  }
  return categories
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
    const repo = AppDataSource.getRepository(Product)
    const product = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
      relations: { categories: true },
    })
    if (!product) throw notFound('product_not_found', 'Product not found')
    res.json({ data: withCategoryIds(product) })
  } catch (err) {
    next(err)
  }
})

// Create
adminProductsRouter.post('/', async (req, res, next) => {
  try {
    const { categoryIds, ...fields } = CreateProductSchema.parse(req.body)
    // Товар и его категории пишутся в одной транзакции: несуществующая
    // категория не оставит за собой товар без связей.
    const saved = await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Product)
      const entity = repo.create(fields)
      entity.categories = await loadCategories(manager, categoryIds ?? [])
      return repo.save(entity)
    })
    // Snapshot the initial state so the revision history has a "t=0" row.
    await writeRevision('product', saved.id, req.adminUser?.id ?? null)
    res.status(201).json({ data: withCategoryIds(saved) })
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
    const { categoryIds, ...fields } = UpdateProductSchema.parse(req.body)
    const repo = AppDataSource.getRepository(Product)
    // Связь categories здесь не грузим: без categoryIds save() её не трогает,
    // иначе устаревший снимок связей затёр бы чужую параллельную правку.
    const existing = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!existing) throw notFound('product_not_found', 'Product not found')
    // Проверяем категории до любой записи: при ошибке не остаётся ни лишней
    // ревизии, ни наполовину применённых правок.
    const nextCategories = categoryIds
      ? await loadCategories(AppDataSource.manager, categoryIds)
      : null
    // Snapshot the prior state before mutating.
    await writeRevision('product', existing.id, req.adminUser?.id ?? null)
    const saved = await AppDataSource.transaction(async (manager) => {
      const merged = manager.getRepository(Product).merge(existing, fields)
      if (nextCategories) merged.categories = nextCategories
      await manager.getRepository(Product).save(merged)
      return manager
        .getRepository(Product)
        .findOneOrFail({ where: { id: existing.id }, relations: { categories: true } })
    })
    res.json({ data: withCategoryIds(saved) })
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
      relations: { categories: true },
    })
    if (!existing) throw notFound('product_not_found', 'Product not found')
    await writeRevision('product', existing.id, req.adminUser?.id ?? null)
    existing.isPublished = true
    const saved = await repo.save(existing)
    res.json({ data: withCategoryIds(saved) })
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
      relations: { categories: true },
    })
    if (!existing) throw notFound('product_not_found', 'Product not found')
    await writeRevision('product', existing.id, req.adminUser?.id ?? null)
    existing.isPublished = false
    const saved = await repo.save(existing)
    res.json({ data: withCategoryIds(saved) })
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
