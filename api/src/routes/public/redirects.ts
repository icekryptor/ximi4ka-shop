import { Router } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { Redirect } from '../../entities/Redirect.js'

export const publicRedirectsRouter: Router = Router()

// Full list of redirects, returned flat (no pagination) — the Next.js
// middleware caches this table in-memory and needs all rows to match a
// request path in O(1)-ish time. Response is marked public+60s so the CDN
// (if any) can shed load, but the middleware mostly relies on its own
// module-scope cache for sub-request-level speed.
publicRedirectsRouter.get('/', async (_req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Redirect)
    const rows = await repo.find({ order: { fromPath: 'ASC' } })
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.json({
      data: rows.map((r) => ({
        id: r.id,
        fromPath: r.fromPath,
        toPath: r.toPath,
        statusCode: r.statusCode,
      })),
    })
  } catch (err) {
    next(err)
  }
})

// Fire-and-forget hit counter. Called by the public middleware on every
// matched redirect; intentionally unauthenticated because the middleware
// runs in an edge context without session cookies to forward. We accept
// the trade-off that a malicious client could bump counts: hit_count is
// a rough popularity signal, not a security-sensitive metric, and the
// endpoint is rate-limited only by the backing database (no DoS concern
// for v1).
publicRedirectsRouter.post('/:id/hit', async (req, res, next) => {
  try {
    const repo = AppDataSource.getRepository(Redirect)
    // A conditional UPDATE is cheaper than load-then-save and atomic enough
    // for the counter; if the id doesn't exist we simply return 204.
    await repo.increment({ id: req.params.id }, 'hitCount', 1)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
