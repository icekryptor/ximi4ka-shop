import express, { type Express } from 'express'

export function createApp(): Express {
  const app = express()

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true })
  })

  return app
}
