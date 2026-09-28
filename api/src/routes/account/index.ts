import { Router } from 'express'
import { createAccountAuthRouter } from './auth.js'
import { createAccountLinkRouter } from './link.js'
import { createAccountProfileRouter } from './profile.js'

export function createAccountRouter(): Router {
  const router = Router()
  router.use('/auth', createAccountAuthRouter())
  router.use(createAccountLinkRouter())
  router.use(createAccountProfileRouter())
  return router
}
