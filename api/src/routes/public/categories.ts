import { Router } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { ProductCategory } from '../../entities/ProductCategory.js'
import { ListQuerySchema } from '../admin/categories.schemas.js'
import { notFound } from '../errors.js'

export const publicCategoriesRouter: Router = Router()

// List all categories (flat)
publicCategoriesRouter.get('/', async (req, res, next) => {
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

// Get by slug
publicCategoriesRouter.get('/:slug', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(ProductCategory)
    const category = await repo.findOne({ where: { slug: req.params.slug } })
    if (!category) throw notFound('category_not_found', 'Category not found')
    res.json({ data: category })
  } catch (err) {
    next(err)
  }
})
