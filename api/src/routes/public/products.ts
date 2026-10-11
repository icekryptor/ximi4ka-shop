import { Router } from 'express'
import { IsNull } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { PublicListQuerySchema } from '../admin/products.schemas.js'
import { notFound } from '../errors.js'
import { unitShipping } from '../../lib/shipping/unit.js'

export const publicProductsRouter: Router = Router()

// List published products
publicProductsRouter.get('/', async (req, res, next) => {
  try {
    const { limit, offset, include } = PublicListQuerySchema.parse(req.query)
    const repo = AppDataSource.getRepository(Product)
    const wantsCategories = include.includes('categories')
    const wantsShipping = include.includes('shipping')
    const [items, total] = await repo.findAndCount({
      where: { isPublished: true, deletedAt: IsNull() },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
      skip: offset,
      take: limit,
      // Always eager-load images so storefront cards and the YML feed
      // can render product photos without N+1 fetches. Categories are
      // optional (only needed by the YML feed generator).
      relations: { images: true, categories: wantsCategories },
    })
    // Shape the include output as a flat `categoryIds` array per product —
    // feeds only need the id strings, and keeping the DB rows private
    // avoids leaking meta_title / meta_description into a CDN-cacheable
    // public response. shipping — вес и габариты одной штуки в упаковке для
    // фида (weight, dimensions), тот же packCart, что и доставка. Только у
    // товаров с реальным весом: расчётные значения в фид не выдумываем.
    const data = items.map((p) => ({
      ...p,
      ...(wantsCategories
        ? { categoryIds: (p.categories ?? []).map((c) => c.id), categories: undefined }
        : {}),
      ...(wantsShipping && p.weightG != null ? { shippingUnit: unitShipping(p) } : {}),
    }))
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
      relations: { images: true, categories: true },
    })
    if (product?.images) {
      // Sort gallery thumbnails by their stored order in JS — `findOne`
      // doesn't accept an `order` clause on relations.
      product.images = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder)
    }
    if (!product) throw notFound('product_not_found', 'Product not found')
    // Наружу — только слаги категорий: объекты категорий (SEO-блоки и т.д.) карточке не нужны.
    const { categories, ...rest } = product
    res.json({ data: { ...rest, categorySlugs: (categories ?? []).map((c) => c.slug) } })
  } catch (err) {
    next(err)
  }
})
