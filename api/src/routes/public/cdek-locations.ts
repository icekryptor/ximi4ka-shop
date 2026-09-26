import { Router, type Response } from 'express'
import { z } from 'zod'
import { getCdekClient } from '../../lib/cdek/index.js'
import { describeCdekError, getCityPoints, suggestCities } from '../../lib/cdek/locations.js'
import { rateLimit } from '../middleware/rateLimit.js'

// Подсказки городов и пункты выдачи для полей чекаута (спека
// docs/superpowers/specs/2026-09-25-cdek-pvz-list-design.md, §4). Только
// чтение: в СДЭК уходят лишь проверенные схемой name/city_code/code.
export const cdekLocationsRouter: Router = Router()

const CitiesQuery = z.object({ q: z.string().trim().min(2).max(100) })
const PointsQuery = z.object({
  cityCode: z.coerce.number().int().positive().max(2_147_483_647),
})

// 502 и строка в лог: без неё сбой СДЭК на чекауте не заметить. В лог — только
// статус и код ошибки, без текста запроса (там город, который набрал покупатель).
function cdekUnavailable(res: Response, what: string, err: unknown): void {
  console.warn(`cdek: ${what} не загрузились —`, describeCdekError(err))
  res.status(502).json({ error: { code: 'cdek_unavailable', message: 'СДЭК временно недоступен' } })
}

// GET /api/public/cdek/cities?q=Моск
cdekLocationsRouter.get(
  '/cities',
  rateLimit({ limit: 60, windowMs: 60_000 }),
  async (req, res, next) => {
    const parsed = CitiesQuery.safeParse(req.query)
    if (!parsed.success) {
      next(parsed.error)
      return
    }
    try {
      res.json({ data: await suggestCities(getCdekClient(), parsed.data.q) })
    } catch (err) {
      cdekUnavailable(res, 'подсказки городов', err)
    }
  },
)

// GET /api/public/cdek/points?cityCode=44
cdekLocationsRouter.get(
  '/points',
  rateLimit({ limit: 60, windowMs: 60_000 }),
  async (req, res, next) => {
    const parsed = PointsQuery.safeParse(req.query)
    if (!parsed.success) {
      next(parsed.error)
      return
    }
    try {
      res.json({ data: await getCityPoints(getCdekClient(), parsed.data.cityCode) })
    } catch (err) {
      cdekUnavailable(res, 'пункты выдачи', err)
    }
  },
)
