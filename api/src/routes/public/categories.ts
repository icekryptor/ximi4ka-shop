import { Router } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { ProductCategory } from '../../entities/ProductCategory.js'
import { Product } from '../../entities/Product.js'
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

// List products in a category by slug
publicCategoriesRouter.get('/:slug/products', async (req, res, next) => {
  try {
    const { limit, offset } = ListQuerySchema.parse(req.query)
    const catRepo = AppDataSource.getRepository(ProductCategory)
    const category = await catRepo.findOne({ where: { slug: req.params.slug } })
    if (!category) throw notFound('category_not_found', 'Category not found')
    const [items, total] = await AppDataSource
      .getRepository(Product)
      .createQueryBuilder('p')
      .innerJoin('product_category_links', 'pcl', 'pcl.product_id = p.id')
      .where('pcl.category_id = :id', { id: category.id })
      .andWhere('p.is_published = true')
      .andWhere('p.deleted_at IS NULL')
      .orderBy('p.sortOrder', 'ASC')
      .addOrderBy('p.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount()
    res.json({ data: items, pagination: { limit, offset, total } })
  } catch (err) {
    next(err)
  }
})
