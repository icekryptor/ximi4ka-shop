import { Router } from 'express'
import { IsNull } from 'typeorm'
import { z } from 'zod'
import { AppDataSource } from '../../config/dataSource.js'
import { BlogPost } from '../../entities/BlogPost.js'
import { notFound } from '../errors.js'

export const publicBlogRouter: Router = Router()

// Blog listing is page-based (?page=&limit=) — the storefront renders
// numbered pagination. The response envelope stays identical to
// /api/public/products ({ data, pagination: { limit, offset, total } })
// so shared client helpers keep working.
const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  page: z.coerce.number().int().min(1).default(1),
})

// List published posts, newest published first.
publicBlogRouter.get('/', async (req, res, next) => {
  try {
    const { limit, page } = ListQuerySchema.parse(req.query)
    const offset = (page - 1) * limit
    const repo = AppDataSource.getRepository(BlogPost)
    const [items, total] = await repo.findAndCount({
      where: {
        isPublished: true,
        deletedAt: IsNull(),
      },
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
      skip: offset,
      take: limit,
    })
    res.json({ data: items, pagination: { limit, offset, page, total } })
  } catch (err) {
    next(err)
  }
})

// Get by slug (published only)
publicBlogRouter.get('/:slug', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(BlogPost)
    const post = await repo.findOne({
      where: {
        slug: req.params.slug,
        isPublished: true,
        deletedAt: IsNull(),
      },
    })
    if (!post) throw notFound('blog_post_not_found', 'Blog post not found')
    res.json({ data: post })
  } catch (err) {
    next(err)
  }
})
