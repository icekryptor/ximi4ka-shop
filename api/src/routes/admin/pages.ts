import { Router } from 'express'
import { IsNull } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import { Page } from '../../entities/Page.js'
import { CreatePageSchema, UpdatePageSchema, ListQuerySchema } from './pages.schemas.js'
import { conflict, notFound } from '../errors.js'
import {
  requireAdminAuth,
  requireCsrfToken,
} from '../middleware/requireAdminAuth.js'

export const adminPagesRouter: Router = Router()

adminPagesRouter.use(requireAdminAuth)
adminPagesRouter.use(requireCsrfToken)

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  )
}

// List
adminPagesRouter.get('/', async (req, res, next) => {
  try {
    const { limit, offset } = ListQuerySchema.parse(req.query)
    const repo = AppDataSource.getRepository(Page)
    const [items, total] = await repo.findAndCount({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    })
    res.json({ data: items, pagination: { limit, offset, total } })
  } catch (err) {
    next(err)
  }
})

// Get by id
adminPagesRouter.get('/:id', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Page)
    const page = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!page) throw notFound('page_not_found', 'Page not found')
    res.json({ data: page })
  } catch (err) {
    next(err)
  }
})

// Create
adminPagesRouter.post('/', async (req, res, next) => {
  try {
    const parsed = CreatePageSchema.parse(req.body)
    const repo = AppDataSource.getRepository(Page)
    const entity = repo.create(parsed)
    const saved = await repo.save(entity)
    res.status(201).json({ data: saved })
  } catch (err) {
    if (isUniqueViolation(err)) {
      next(conflict('slug_conflict', 'A page with this slug already exists'))
      return
    }
    next(err)
  }
})

// Update
adminPagesRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = UpdatePageSchema.parse(req.body)
    const repo = AppDataSource.getRepository(Page)
    const existing = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!existing) throw notFound('page_not_found', 'Page not found')
    const merged = repo.merge(existing, parsed)
    const saved = await repo.save(merged)
    res.json({ data: saved })
  } catch (err) {
    if (isUniqueViolation(err)) {
      next(conflict('slug_conflict', 'A page with this slug already exists'))
      return
    }
    next(err)
  }
})

// Publish
adminPagesRouter.post('/:id/publish', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Page)
    const existing = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!existing) throw notFound('page_not_found', 'Page not found')
    existing.isPublished = true
    const saved = await repo.save(existing)
    res.json({ data: saved })
  } catch (err) {
    next(err)
  }
})

// Unpublish
adminPagesRouter.post('/:id/unpublish', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Page)
    const existing = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!existing) throw notFound('page_not_found', 'Page not found')
    existing.isPublished = false
    const saved = await repo.save(existing)
    res.json({ data: saved })
  } catch (err) {
    next(err)
  }
})

// Soft delete
adminPagesRouter.delete('/:id', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Page)
    const existing = await repo.findOne({
      where: { id: req.params.id, deletedAt: IsNull() },
    })
    if (!existing) throw notFound('page_not_found', 'Page not found')
    await repo.softRemove(existing)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
