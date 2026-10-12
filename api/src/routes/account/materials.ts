import { Router } from 'express'
import { sendMaterialFile } from '../../lib/materials/files.js'
import { findCustomerMaterial, isUuid, listCustomerMaterials } from '../../lib/materials/queries.js'
import { notFound } from '../errors.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { requireCustomerAuth, requireCustomerCsrf } from '../middleware/requireCustomerAuth.js'

// «Мои материалы»: список выданного и закрытое скачивание. Всё требует сессии
// покупателя; чужой, отозванный и неактивный материал для него просто 404.
export function createAccountMaterialsRouter(): Router {
  const router = Router()
  router.use(requireCustomerAuth, requireCustomerCsrf)

  router.get('/materials', async (req, res, next) => {
    try {
      res.json({ data: await listCustomerMaterials(req.customer!.id) })
    } catch (err) {
      next(err)
    }
  })

  router.get(
    '/materials/:materialId/download',
    rateLimit({ limit: 60, windowMs: 60_000 }),
    async (req, res, next) => {
      try {
        const { materialId } = req.params
        const material = isUuid(materialId)
          ? await findCustomerMaterial(req.customer!.id, materialId)
          : null
        if (!material || material.kind !== 'file') {
          throw notFound('material_not_found', 'Материал не найден')
        }
        if (!(await sendMaterialFile(res, material))) {
          throw notFound('material_file_missing', 'Файл временно недоступен')
        }
      } catch (err) {
        next(err)
      }
    },
  )

  return router
}
