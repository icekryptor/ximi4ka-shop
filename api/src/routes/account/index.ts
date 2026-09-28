import { Router } from 'express'
import { createAccountAuthRouter } from './auth.js'

export function createAccountRouter(): Router {
  const router = Router()
  router.use('/auth', createAccountAuthRouter())
  return router
}
