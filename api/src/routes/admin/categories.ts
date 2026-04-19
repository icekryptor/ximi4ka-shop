import { Router } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { ProductCategory } from '../../entities/ProductCategory.js'
import {
  CreateCategorySchema,
  UpdateCategorySchema,
  ListQuerySchema,
} from './categories.schemas.js'
import { conflict, notFound } from '../errors.js'

export const adminCategoriesRouter: Router = Router()

// TODO(phase-3): adminCategoriesRouter.use(requireAdminAuth())

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  )
}

// List
adminCategoriesRouter.get('/', async (req, res, next) => {
  try {
    const { limit, offset } = ListQuerySchema.parse(req.query)
    const repo = AppDataSource.getRepository(ProductCategory)
    const [items, total] = await repo.findAndCount({
      order: { sortOrder: 'ASC', name: 'ASC' },
      skip: offset,
      take: limit,
    })
    res.json({ data: items, pagination: { limit, offset, total } })
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
    res.json({ data: category })
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
