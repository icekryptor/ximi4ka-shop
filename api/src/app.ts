import express, { type Express } from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { publicProductsRouter } from './routes/public/products.js'
import { adminProductsRouter } from './routes/admin/products.js'
import { publicCategoriesRouter } from './routes/public/categories.js'
import { adminCategoriesRouter } from './routes/admin/categories.js'
import { publicPagesRouter } from './routes/public/pages.js'
import { adminPagesRouter } from './routes/admin/pages.js'
import { publicBlogRouter } from './routes/public/blog.js'
import { mediaRouter } from './routes/admin/media.js'
import { adminRedirectsRouter } from './routes/admin/redirects.js'
import { publicRedirectsRouter } from './routes/public/redirects.js'
import { adminRevisionsRouter } from './routes/admin/revisions.js'
import { adminSettingsRouter } from './routes/admin/settings.js'
import { publicSettingsRouter } from './routes/public/settings.js'
import { authRouter } from './routes/auth/index.js'
import { errorHandler } from './routes/errors.js'
import { UPLOADS_DIR } from './lib/storage/index.js'

export function createApp(): Express {
  const app = express()

  // CORS — the web app (http://localhost:3000 in dev) and the api
  // (http://localhost:3001) live on different origins. Login sets HttpOnly
  // cookies that must round-trip to the browser, so we need credentials: true.
  app.use(
    cors({
      origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
      credentials: true,
    }),
  )

  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true })
  })

  app.use('/api/auth', authRouter)
  app.use('/api/public/products', publicProductsRouter)
  app.use('/api/admin/products', adminProductsRouter)
  app.use('/api/public/categories', publicCategoriesRouter)
  app.use('/api/admin/categories', adminCategoriesRouter)
  app.use('/api/public/pages', publicPagesRouter)
  app.use('/api/admin/pages', adminPagesRouter)
  app.use('/api/public/blog', publicBlogRouter)
  app.use('/api/admin/media', mediaRouter)
  app.use('/api/public/redirects', publicRedirectsRouter)
  app.use('/api/admin/redirects', adminRedirectsRouter)
  app.use('/api/admin/revisions', adminRevisionsRouter)
  app.use('/api/public/settings', publicSettingsRouter)
  app.use('/api/admin/settings', adminSettingsRouter)

  // Serve uploaded files statically. UPLOADS_DIR is resolved relative to the
  // storage module, not process.cwd(), so it behaves consistently whether
  // launched from the repo root or from api/ via `npm run dev -w api`.
  app.use('/uploads', express.static(UPLOADS_DIR))

  app.use(errorHandler)

  return app
}
