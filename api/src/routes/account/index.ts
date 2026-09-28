import { Router } from 'express'
import { createAccountAuthRouter } from './auth.js'
import { createAccountLinkRouter } from './link.js'

export function createAccountRouter(): Router {
  const router = Router()
  router.use('/auth', createAccountAuthRouter())
  router.use(createAccountLinkRouter())
  return router
}
