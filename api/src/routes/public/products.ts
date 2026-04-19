import { Router } from 'express'
import { IsNull } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { ListQuerySchema } from '../admin/products.schemas.js'
import { notFound } from '../errors.js'

export const publicProductsRouter: Router = Router()

// List published products
publicProductsRouter.get('/', async (req, res, next) => {
  try {
    const { limit, offset } = ListQuerySchema.parse(req.query)
    const repo = AppDataSource.getRepository(Product)
    const [items, total] = await repo.findAndCount({
      where: { isPublished: true, deletedAt: IsNull() },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
      skip: offset,
      take: limit,
    })
    res.json({ data: items, pagination: { limit, offset, total } })
  } catch (err) {
    next(err)
  }
})

// Get by slug
publicProductsRouter.get('/:slug', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Product)
    const product = await repo.findOne({
      where: {
        slug: req.params.slug,
        isPublished: true,
        deletedAt: IsNull(),
      },
    })
    if (!product) throw notFound('product_not_found', 'Product not found')
    res.json({ data: product })
  } catch (err) {
    next(err)
  }
})
