import { Router } from 'express'
import { In } from 'typeorm'
import { z } from 'zod'
import { AppDataSource } from '../../config/dataSource.js'
import { EntityRevision } from '../../entities/EntityRevision.js'
import { AdminUser } from '../../entities/AdminUser.js'
import { notFound } from '../errors.js'
import {
  requireAdminAuth,
  requireCsrfToken,
} from '../middleware/requireAdminAuth.js'
import {
  writeRevision,
  restoreRevision,
  type RevisionEntityType,
} from '../../lib/revisions.js'

export const adminRevisionsRouter: Router = Router()

adminRevisionsRouter.use(requireAdminAuth)
adminRevisionsRouter.use(requireCsrfToken)

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

const EntityTypeSchema = z.enum(['product', 'page', 'product_category', 'blog_post'])

// List revisions for a given entity. Paginated, newest first. The editor's
// email is joined in-memory rather than changing the entity to hold a
// relation — revisions are append-only and unlikely to be listed in bulk.
adminRevisionsRouter.get('/entity/:entityType/:entityId', async (req, res, next) => {
  try {
    const entityType = EntityTypeSchema.parse(req.params.entityType)
    const entityId = z.string().uuid().parse(req.params.entityId)
    const { limit, offset } = ListQuerySchema.parse(req.query)

    const repo = AppDataSource.getRepository(EntityRevision)
    const [items, total] = await repo.findAndCount({
      where: { entityType, entityId },
      order: { editedAt: 'DESC' },
      skip: offset,
      take: limit,
    })

    const adminIds = Array.from(
      new Set(items.map((r) => r.editedBy).filter((x): x is string => !!x)),
    )
    const emailById = new Map<string, string>()
    if (adminIds.length) {
      const admins = await AppDataSource.getRepository(AdminUser).findBy({
        id: In(adminIds),
      })
      for (const a of admins) emailById.set(a.id, a.email)
    }

    const data = items.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId,
      editedAt: r.editedAt,
      editedBy: r.editedBy,
      editorEmail: r.editedBy ? emailById.get(r.editedBy) ?? null : null,
    }))

    res.json({ data, pagination: { limit, offset, total } })
  } catch (err) {
    next(err)
  }
})

// Fetch a single revision's full snapshot. Useful if the UI grows a
// "preview before restore" affordance — not currently used.
adminRevisionsRouter.get('/single/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const rev = await AppDataSource.getRepository(EntityRevision).findOneBy({ id })
    if (!rev) throw notFound('revision_not_found', 'Revision not found')
    res.json({ data: rev })
  } catch (err) {
    next(err)
  }
})

// Restore an entity to a revision. We snapshot the current state first so
// the operation is itself reversible.
adminRevisionsRouter.post('/:id/restore', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const rev = await AppDataSource.getRepository(EntityRevision).findOneBy({ id })
    if (!rev) throw notFound('revision_not_found', 'Revision not found')
    await writeRevision(
      rev.entityType as RevisionEntityType,
      rev.entityId,
      req.adminUser?.id ?? null,
    )
    const result = await restoreRevision(id)
    if (!result) throw notFound('revision_not_found', 'Revision not found')
    res.json({ data: { entityType: result.entityType, entityId: result.entityId } })
  } catch (err) {
    next(err)
  }
})
