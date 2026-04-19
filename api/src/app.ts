import express, { type Express } from 'express'
import { publicProductsRouter } from './routes/public/products.js'
import { adminProductsRouter } from './routes/admin/products.js'
import { errorHandler } from './routes/errors.js'

export function createApp(): Express {
  const app = express()

  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true })
  })

  app.use('/api/public/products', publicProductsRouter)
  app.use('/api/admin/products', adminProductsRouter)

  app.use(errorHandler)

  return app
}
