import { Router } from 'express'
import { getStats } from '../../lib/analytics/stats.js'
import { requireAdminAuth, requireCsrfToken } from '../middleware/requireAdminAuth.js'
import { StatsQuerySchema } from './stats.schemas.js'

export const adminStatsRouter: Router = Router()

adminStatsRouter.use(requireAdminAuth)
adminStatsRouter.use(requireCsrfToken)

// GET /api/admin/stats?from=YYYY-MM-DD&to=YYYY-MM-DD — оба дня включительно, по Москве.
adminStatsRouter.get('/', async (req, res, next) => {
  try {
    const { from, to } = StatsQuerySchema.parse(req.query)
    res.json({ data: await getStats(from, to) })
  } catch (err) {
    next(err)
  }
})
