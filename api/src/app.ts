import express, { type Express } from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { publicProductsRouter } from './routes/public/products.js'
import { adminProductsRouter } from './routes/admin/products.js'
import { publicCategoriesRouter } from './routes/public/categories.js'
import { adminCategoriesRouter } from './routes/admin/categories.js'
import { publicPagesRouter } from './routes/public/pages.js'
import { adminPagesRouter } from './routes/admin/pages.js'
import { authRouter } from './routes/auth/index.js'
import { errorHandler } from './routes/errors.js'

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

  app.use(errorHandler)

  return app
}
