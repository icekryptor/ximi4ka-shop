import { Router } from 'express'
import { Brackets, IsNull } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import { BlogPost } from '../../entities/BlogPost.js'
import {
  CreateBlogPostSchema,
  UpdateBlogPostSchema,
  ListQuerySchema,
} from './blog.schemas.js'
import { conflict, notFound } from '../errors.js'
import {
  requireAdminAuth,
  requireCsrfToken,
} from '../middleware/requireAdminAuth.js'
import { writeRevision } from '../../lib/revisions.js'

export const adminBlogRouter: Router = Router()

adminBlogRouter.use(requireAdminAuth)
adminBlogRouter.use(requireCsrfToken)

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  )
}

// List
adminBlogRouter.get('/', async (req, res, next) => {
  try {
    const { limit, offset, q } = ListQuerySchema.parse(req.query)
    const repo = AppDataSource.getRepository(BlogPost)
    const qb = repo
      .createQueryBuilder('p')
      .where('p.deleted_at IS NULL')
      .orderBy('p.created_at', 'DESC')
      .skip(offset)
      .take(limit)
    if (q) {
      qb.andWhere(
        new Brackets((qq) => {
          qq.where('p.title ILIKE :q', { q: `%${q}%` }).orWhere(
            'p.slug ILIKE :q',
            { q: `%${q}%` },
          )
        }),
      )
    }
    const [items, total] = await qb.getManyAndCount()
    res.json({ data: items, pagination: { limit, offset, total } })
  } catch (err) {
    next(err)
  }
})

// Get by id
adminBlogRouter.get('/:id', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(BlogPost)
    const post = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!post) throw notFound('blog_post_not_found', 'Blog post not found')
    res.json({ data: post })
  } catch (err) {
    next(err)
  }
})

// Create. Posts are always born as drafts — publish is a separate action.
// published_at is set explicitly so the created response carries the full
// editorial state (columns without a DB default are not reloaded by save()).
adminBlogRouter.post('/', async (req, res, next) => {
  try {
    const parsed = CreateBlogPostSchema.parse(req.body)
    const repo = AppDataSource.getRepository(BlogPost)
    const entity = repo.create({
      ...parsed,
      isPublished: false,
      publishedAt: null,
    })
    const saved = await repo.save(entity)
    await writeRevision('blog_post', saved.id, req.adminUser?.id ?? null)
    res.status(201).json({ data: saved })
  } catch (err) {
    if (isUniqueViolation(err)) {
      next(conflict('slug_conflict', 'A blog post with this slug already exists'))
      return
    }
    next(err)
  }
})

// Update
adminBlogRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = UpdateBlogPostSchema.parse(req.body)
    const repo = AppDataSource.getRepository(BlogPost)
    const existing = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!existing) throw notFound('blog_post_not_found', 'Blog post not found')
    await writeRevision('blog_post', existing.id, req.adminUser?.id ?? null)
    const merged = repo.merge(existing, parsed)
    const saved = await repo.save(merged)
    res.json({ data: saved })
  } catch (err) {
    if (isUniqueViolation(err)) {
      next(conflict('slug_conflict', 'A blog post with this slug already exists'))
      return
    }
    next(err)
  }
})

// Publish. First publish stamps published_at; republishing after an
// unpublish keeps the original date so the public listing order is stable.
adminBlogRouter.post('/:id/publish', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(BlogPost)
    const existing = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!existing) throw notFound('blog_post_not_found', 'Blog post not found')
    await writeRevision('blog_post', existing.id, req.adminUser?.id ?? null)
    existing.isPublished = true
    if (!existing.publishedAt) existing.publishedAt = new Date()
    const saved = await repo.save(existing)
    res.json({ data: saved })
  } catch (err) {
    next(err)
  }
})

// Unpublish. published_at is intentionally left as-is (see publish above).
adminBlogRouter.post('/:id/unpublish', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(BlogPost)
    const existing = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!existing) throw notFound('blog_post_not_found', 'Blog post not found')
    await writeRevision('blog_post', existing.id, req.adminUser?.id ?? null)
    existing.isPublished = false
    const saved = await repo.save(existing)
    res.json({ data: saved })
  } catch (err) {
    next(err)
  }
})

// Soft delete
adminBlogRouter.delete('/:id', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(BlogPost)
    const existing = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!existing) throw notFound('blog_post_not_found', 'Blog post not found')
    await writeRevision('blog_post', existing.id, req.adminUser?.id ?? null)
    await repo.softRemove(existing)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
