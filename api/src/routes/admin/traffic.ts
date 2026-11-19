import { Router } from 'express'
import { getTrafficSources, getTrafficStatus } from '../../lib/searchStats/queries.js'
import { requireAdminAuth, requireCsrfToken, requireRole } from '../middleware/requireAdminAuth.js'
import { StatsQuerySchema } from './stats.schemas.js'

export const adminTrafficRouter: Router = Router()

adminTrafficRouter.use(requireAdminAuth)
adminTrafficRouter.use(requireCsrfToken)
// Трафик рядом с суммами заказов (блок 2 в следующих PR): только роль admin.
adminTrafficRouter.use(requireRole('admin'))

// GET /api/admin/traffic/status — журнал синхронизаций и диапазон данных.
adminTrafficRouter.get('/status', async (_req, res, next) => {
  try {
    res.json({ data: await getTrafficStatus(process.env) })
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/traffic/sources?from=YYYY-MM-DD&to=YYYY-MM-DD — оба дня включительно.
adminTrafficRouter.get('/sources', async (req, res, next) => {
  try {
    const { from, to } = StatsQuerySchema.parse(req.query)
    res.json({ data: await getTrafficSources(from, to) })
  } catch (err) {
    next(err)
  }
})
