import { Router } from 'express'
import { IsNull } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { PublicListQuerySchema } from '../admin/products.schemas.js'
import { notFound } from '../errors.js'

export const publicProductsRouter: Router = Router()

// List published products
publicProductsRouter.get('/', async (req, res, next) => {
  try {
    const { limit, offset, include } = PublicListQuerySchema.parse(req.query)
    const repo = AppDataSource.getRepository(Product)
    const wantsCategories = include.includes('categories')
    const [items, total] = await repo.findAndCount({
      where: { isPublished: true, deletedAt: IsNull() },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
      skip: offset,
      take: limit,
      // Eager-load the category link rows only when asked. The feed
      // generator (YML) relies on this to build <categoryId> entries
      // without N+1'ing the link table.
      relations: wantsCategories ? { categories: true } : undefined,
    })
    // Shape the include output as a flat `categoryIds` array per product —
    // feeds only need the id strings, and keeping the DB rows private
    // avoids leaking meta_title / meta_description into a CDN-cacheable
    // public response.
    const data = wantsCategories
      ? items.map((p) => ({
          ...p,
          categoryIds: (p.categories ?? []).map((c) => c.id),
          categories: undefined,
        }))
      : items
    res.json({ data, pagination: { limit, offset, total } })
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
