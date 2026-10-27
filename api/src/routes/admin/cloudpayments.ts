import { Router } from 'express'
import type { PublicCloudPayments } from '@ximi4ka-shop/shared'
import { getCloudPaymentsConfig } from '../../lib/payments/cloudpayments/config.js'
import { requireAdminAuth } from '../middleware/requireAdminAuth.js'

export const adminCloudPaymentsRouter: Router = Router()

// Любая роль админки. Только GET — CSRF не нужен.
adminCloudPaymentsRouter.use(requireAdminAuth)

// GET /api/admin/cloudpayments/checkout-preview — для чекаута с ?cp_test=1: на проде в
// режиме «Тест» публичные настройки отдают null (они кешируются для всех), а вошедший
// админ видит способ с этим процентом. Боевой режим, выключенный рубильник или нет
// ключей — null: там витрина работает по публичным настройкам.
adminCloudPaymentsRouter.get('/checkout-preview', async (_req, res, next) => {
  try {
    const cfg = await getCloudPaymentsConfig()
    const data: PublicCloudPayments | null =
      cfg && cfg.enabled && cfg.mode === 'test' ? { surchargePercent: cfg.surchargePercent } : null
    // Ответ зависит от cookie админа — ни браузер, ни прокси его не кешируют.
    res.set('Cache-Control', 'no-store')
    res.json({ data })
  } catch (err) {
    next(err)
  }
})
