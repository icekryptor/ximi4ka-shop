import { Router } from 'express'
import { createAccountAuthRouter } from './auth.js'
import { createAccountLinkRouter } from './link.js'
import { createAccountProfileRouter } from './profile.js'
import { createAccountSsoRouter } from './sso.js'

export function createAccountRouter(): Router {
  const router = Router()
  router.use('/auth', createAccountAuthRouter())
  // До link: тот вешает requireCustomerAuth на всё, что через него проходит,
  // а /sso/token ходит без cookie.
  router.use('/sso', createAccountSsoRouter())
  router.use(createAccountLinkRouter())
  router.use(createAccountProfileRouter())
  return router
}
