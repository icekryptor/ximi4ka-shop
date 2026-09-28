import { Router } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { Customer } from '../../entities/Customer.js'
import { requireCustomerAuth, requireCustomerCsrf } from '../middleware/requireCustomerAuth.js'
import { ProfilePatchSchema } from './schemas.js'
import { lastDeliveryFor, listCustomerOrders, toProfile } from '../../lib/account/orders.js'

// Профиль и история заказов покупателя (спека §5). Всё требует активной
// сессии — своей карточки и своих заказов дотянуться до чужих нельзя.
export function createAccountProfileRouter(): Router {
  const router = Router()
  router.use(requireCustomerAuth, requireCustomerCsrf)

  router.get('/me', async (req, res, next) => {
    try {
      res.json({ data: toProfile(req.customer!, await lastDeliveryFor(req.customer!.id)) })
    } catch (err) {
      next(err)
    }
  })

  router.patch('/me', async (req, res, next) => {
    try {
      const patch = ProfilePatchSchema.parse(req.body)
      const repo = AppDataSource.getRepository(Customer)
      if (Object.keys(patch).length > 0) {
        await repo.update({ id: req.customer!.id }, patch)
      }
      const fresh = await repo.findOneByOrFail({ id: req.customer!.id })
      res.json({ data: toProfile(fresh, await lastDeliveryFor(fresh.id)) })
    } catch (err) {
      next(err)
    }
  })

  router.get('/orders', async (req, res, next) => {
    try {
      const cursor =
        typeof req.query.cursor === 'string' && req.query.cursor ? req.query.cursor : null
      res.json({ data: await listCustomerOrders(req.customer!.id, cursor) })
    } catch (err) {
      next(err)
    }
  })

  return router
}
