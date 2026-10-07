import { Router } from 'express'
import { z } from 'zod'
import type { SearchResult } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { BlogPost } from '../../entities/BlogPost.js'

export const publicSearchRouter: Router = Router()

// Live-preview search for the storefront header. Deliberately compact: it
// only returns what the dropdown renders (thumbnail + name + price for
// products, title for posts) so the response stays small and safe to cache.
// Поля id, stockStatus и categories нужны оптовому блоку, чтобы положить товар в корзину.
const PRODUCT_LIMIT = 6
const WHOLESALE_PRODUCT_LIMIT = 8
const POST_LIMIT = 3
// Категории, в которых у товаров есть оптовое правило (комбо и печать — без скидок).
const WHOLESALE_CATEGORIES = ['kits', 'reagents', 'equipment']

const QuerySchema = z.object({
  // Trim, then require ≥2 chars. A shorter query yields an empty result set
  // rather than an error so the header can call the endpoint on every
  // keystroke without special-casing short input.
  q: z.string().trim().default(''),
  scope: z.enum(['wholesale']).optional(),
})

// Escape LIKE wildcards so a user typing `%` or `_` searches literally.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

publicSearchRouter.get('/', async (req, res, next) => {
  try {
    const { q, scope } = QuerySchema.parse(req.query)

    const empty: SearchResult = { products: [], posts: [] }
    if (q.length < 2) {
      res.json({ data: empty })
      return
    }

    const pattern = `%${escapeLike(q)}%`

    const productRepo = AppDataSource.getRepository(Product)
    const productQuery = productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.images', 'image')
      .leftJoinAndSelect('product.categories', 'category')
      // ILIKE = case-insensitive; works for Cyrillic. Match across the three
      // fields a shopper is most likely to search by.
      .where('product.isPublished = true')
      .andWhere('product.deletedAt IS NULL')
      .andWhere(
        '(product.name ILIKE :pattern OR product.sku ILIKE :pattern OR product.shortDescription ILIKE :pattern)',
        { pattern },
      )
    if (scope === 'wholesale') {
      productQuery.andWhere(
        `EXISTS (SELECT 1 FROM product_category_links l
               JOIN product_categories c ON c.id = l.category_id
              WHERE l.product_id = product.id AND c.slug IN (:...wholesaleCategories))`,
        { wholesaleCategories: WHOLESALE_CATEGORIES },
      )
    }
    const products = await productQuery
      .orderBy('product.sortOrder', 'ASC')
      .addOrderBy('product.createdAt', 'DESC')
      .take(scope === 'wholesale' ? WHOLESALE_PRODUCT_LIMIT : PRODUCT_LIMIT)
      .getMany()

    const postRepo = AppDataSource.getRepository(BlogPost)
    const posts = await postRepo
      .createQueryBuilder('post')
      .where('post.isPublished = true')
      .andWhere('post.deletedAt IS NULL')
      .andWhere('post.title ILIKE :pattern', { pattern })
      .orderBy('post.publishedAt', 'DESC')
      .addOrderBy('post.createdAt', 'DESC')
      .take(POST_LIMIT)
      .getMany()

    const result: SearchResult = {
      products: products.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        priceRub: p.priceRub,
        image: [...(p.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url ?? null,
        stockStatus: p.stockStatus,
        categories: (p.categories ?? []).map((c) => c.slug),
      })),
      posts: posts.map((post) => ({ slug: post.slug, title: post.title })),
    }

    res.json({ data: result })
  } catch (err) {
    next(err)
  }
})
