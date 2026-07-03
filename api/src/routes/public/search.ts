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
const PRODUCT_LIMIT = 6
const POST_LIMIT = 3

const QuerySchema = z.object({
  // Trim, then require ≥2 chars. A shorter query yields an empty result set
  // rather than an error so the header can call the endpoint on every
  // keystroke without special-casing short input.
  q: z.string().trim().default(''),
})

// Escape LIKE wildcards so a user typing `%` or `_` searches literally.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

publicSearchRouter.get('/', async (req, res, next) => {
  try {
    const { q } = QuerySchema.parse(req.query)

    const empty: SearchResult = { products: [], posts: [] }
    if (q.length < 2) {
      res.json({ data: empty })
      return
    }

    const pattern = `%${escapeLike(q)}%`

    const productRepo = AppDataSource.getRepository(Product)
    const products = await productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.images', 'image')
      // ILIKE = case-insensitive; works for Cyrillic. Match across the three
      // fields a shopper is most likely to search by.
      .where('product.isPublished = true')
      .andWhere('product.deletedAt IS NULL')
      .andWhere(
        '(product.name ILIKE :pattern OR product.sku ILIKE :pattern OR product.shortDescription ILIKE :pattern)',
        { pattern },
      )
      .orderBy('product.sortOrder', 'ASC')
      .addOrderBy('product.createdAt', 'DESC')
      .take(PRODUCT_LIMIT)
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
        slug: p.slug,
        name: p.name,
        priceRub: p.priceRub,
        image:
          [...(p.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)[0]
            ?.url ?? null,
      })),
      posts: posts.map((post) => ({ slug: post.slug, title: post.title })),
    }

    res.json({ data: result })
  } catch (err) {
    next(err)
  }
})
