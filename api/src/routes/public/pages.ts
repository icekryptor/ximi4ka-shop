import { Router } from 'express'
import { IsNull } from 'typeorm'
import { z } from 'zod'
import { AppDataSource } from '../../config/dataSource.js'
import { Page } from '../../entities/Page.js'
import { notFound } from '../errors.js'

export const publicPagesRouter: Router = Router()

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

// List all published pages (non-deleted). Used by the sitemap and any
// public nav consumer that needs to enumerate CMS pages. The `home` slug
// is intentionally included here — sitemap consumers filter it out since
// it's served from `/` instead of `/home`.
publicPagesRouter.get('/', async (req, res, next) => {
  try {
    const { limit, offset } = ListQuerySchema.parse(req.query)
    const repo = AppDataSource.getRepository(Page)
    const [items, total] = await repo.findAndCount({
      where: {
        isPublished: true,
        deletedAt: IsNull(),
      },
      order: { slug: 'ASC' },
      skip: offset,
      take: limit,
    })
    res.json({ data: items, pagination: { limit, offset, total } })
  } catch (err) {
    next(err)
  }
})

// Get by slug (published only)
publicPagesRouter.get('/:slug', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Page)
    const page = await repo.findOne({
      where: {
        slug: req.params.slug,
        isPublished: true,
        deletedAt: IsNull(),
      },
    })
    if (!page) throw notFound('page_not_found', 'Page not found')
    res.json({ data: page })
  } catch (err) {
    next(err)
  }
})
