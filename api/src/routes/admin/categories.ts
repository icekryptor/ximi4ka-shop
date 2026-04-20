import { Router } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { ProductCategory } from '../../entities/ProductCategory.js'
import {
  CreateCategorySchema,
  UpdateCategorySchema,
  ListQuerySchema,
} from './categories.schemas.js'
import { conflict, notFound } from '../errors.js'
import { requireAdminAuth, requireCsrfToken } from '../middleware/requireAdminAuth.js'

export const adminCategoriesRouter: Router = Router()

adminCategoriesRouter.use(requireAdminAuth)
adminCategoriesRouter.use(requireCsrfToken)

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  )
}

// Count of non-deleted linked products for a given category id.
async function countProductsForCategory(categoryId: string): Promise<number> {
  const [row] = await AppDataSource.query(
    `SELECT COUNT(DISTINCT p.id)::int AS count
       FROM product_category_links pcl
       JOIN products p ON p.id = pcl.product_id AND p.deleted_at IS NULL
      WHERE pcl.category_id = $1`,
    [categoryId],
  )
  return Number(row?.count ?? 0)
}

// List — includes per-category product count. We do a raw aggregate keyed by
// category id and merge into the entity objects. Using a raw aggregate (rather
// than a loadRelationCountAndMap) keeps it portable and respects the
// product soft-delete filter.
adminCategoriesRouter.get('/', async (req, res, next) => {
  try {
    const { limit, offset } = ListQuerySchema.parse(req.query)
    const repo = AppDataSource.getRepository(ProductCategory)
    const [items, total] = await repo.findAndCount({
      order: { sortOrder: 'ASC', name: 'ASC' },
      skip: offset,
      take: limit,
    })

    const counts = new Map<string, number>()
    if (items.length > 0) {
      const ids = items.map((c) => c.id)
      const rows: Array<{ category_id: string; count: number }> = await AppDataSource.query(
        `SELECT pcl.category_id, COUNT(DISTINCT p.id)::int AS count
             FROM product_category_links pcl
             JOIN products p ON p.id = pcl.product_id AND p.deleted_at IS NULL
            WHERE pcl.category_id = ANY($1::uuid[])
            GROUP BY pcl.category_id`,
        [ids],
      )
      for (const r of rows) counts.set(r.category_id, Number(r.count))
    }

    const data = items.map((entity) => ({
      ...entity,
      productCount: counts.get(entity.id) ?? 0,
    }))

    res.json({ data, pagination: { limit, offset, total } })
  } catch (err) {
    next(err)
  }
})

// Get by id
adminCategoriesRouter.get('/:id', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(ProductCategory)
    const category = await repo.findOne({ where: { id: req.params.id } })
    if (!category) throw notFound('category_not_found', 'Category not found')
    const productCount = await countProductsForCategory(category.id)
    res.json({ data: { ...category, productCount } })
  } catch (err) {
    next(err)
  }
})

// Create
adminCategoriesRouter.post('/', async (req, res, next) => {
  try {
    const parsed = CreateCategorySchema.parse(req.body)
    const repo = AppDataSource.getRepository(ProductCategory)
    const entity = repo.create(parsed)
    const saved = await repo.save(entity)
    res.status(201).json({ data: saved })
  } catch (err) {
    if (isUniqueViolation(err)) {
      next(conflict('slug_conflict', 'A category with this slug already exists'))
      return
    }
    next(err)
  }
})

// Update
adminCategoriesRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = UpdateCategorySchema.parse(req.body)
    const repo = AppDataSource.getRepository(ProductCategory)
    const existing = await repo.findOne({ where: { id: req.params.id } })
    if (!existing) throw notFound('category_not_found', 'Category not found')
    const merged = repo.merge(existing, parsed)
    const saved = await repo.save(merged)
    res.json({ data: saved })
  } catch (err) {
    if (isUniqueViolation(err)) {
      next(conflict('slug_conflict', 'A category with this slug already exists'))
      return
    }
    next(err)
  }
})

// Hard delete (blocks if any products linked)
adminCategoriesRouter.delete('/:id', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(ProductCategory)
    const existing = await repo.findOne({ where: { id: req.params.id } })
    if (!existing) throw notFound('category_not_found', 'Category not found')
    const [{ count }] = await AppDataSource.query(
      'SELECT COUNT(*)::int AS count FROM product_category_links WHERE category_id = $1',
      [req.params.id],
    )
    if (count > 0) {
      throw conflict(
        'category_has_products',
        'Category has associated products; unlink them first.',
      )
    }
    await repo.remove(existing)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
