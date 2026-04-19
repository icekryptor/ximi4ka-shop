import { Router } from 'express'
import { IsNull } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import { Page } from '../../entities/Page.js'
import { notFound } from '../errors.js'

export const publicPagesRouter: Router = Router()

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
