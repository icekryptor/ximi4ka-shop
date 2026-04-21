import { Router } from 'express'
import { z } from 'zod'
import { AppDataSource } from '../../config/dataSource.js'
import { SiteSettings } from '../../entities/SiteSettings.js'
import { getSettings } from '../../lib/settings.js'
import {
  requireAdminAuth,
  requireCsrfToken,
} from '../middleware/requireAdminAuth.js'

// Zod schema for the PATCH body. Every field is optional — the form saves
// all tabs at once, but unchanged fields are simply omitted rather than
// round-tripped, and validation errors on one field shouldn't reject the
// whole payload if the admin didn't touch it.
//
// Nullable fields mirror the entity: empty-string from the form is mapped
// to null client-side so we don't end up with accidental "''" strings in
// columns where "no value" is meaningful.
//
// `url()` is a lightweight sanity check — we don't enforce a specific
// scheme because ymlUrl may reasonably be https-only in prod, but allowing
// any valid URL keeps local/dev workflows easy.
const UpdateSchema = z.object({
  metrikaId: z.string().trim().max(64).nullable().optional(),
  ga4Id: z.string().trim().max(64).nullable().optional(),
  robotsTxt: z.string().max(10000).optional(),
  llmsTxt: z.string().max(10000).optional(),
  yandexWebmasterVerification: z.string().trim().max(64).nullable().optional(),
  googleSiteVerification: z.string().trim().max(64).nullable().optional(),
  ymlShopName: z.string().trim().max(255).nullable().optional(),
  ymlCompany: z.string().trim().max(255).nullable().optional(),
  ymlUrl: z.string().trim().url().max(500).nullable().optional(),
  // Currency is an enum on the DB column too; mirror it here so a wrong
  // string from the form becomes a structured validation_error.
  ymlCurrency: z.enum(['RUB', 'RUR']).optional(),
  // Delivery note is free-form; 2000 chars is generous but bounded so a
  // paste of something enormous doesn't balloon the settings row.
  ymlDeliveryNote: z.string().max(2000).nullable().optional(),
  yandexPayEnabled: z.boolean().optional(),
  yandexPayMode: z.enum(['sandbox', 'production']).optional(),
})

export const adminSettingsRouter: Router = Router()

adminSettingsRouter.use(requireAdminAuth)
adminSettingsRouter.use(requireCsrfToken)

adminSettingsRouter.get('/', async (_req, res, next) => {
  try {
    const settings = await getSettings()
    res.json({ data: settings })
  } catch (err) {
    next(err)
  }
})

adminSettingsRouter.patch('/', async (req, res, next) => {
  try {
    const patch = UpdateSchema.parse(req.body)
    const repo = AppDataSource.getRepository(SiteSettings)
    // Ensure the row exists before update so a patch right after a partial
    // data-restore doesn't silently no-op.
    await getSettings()
    if (Object.keys(patch).length > 0) {
      await repo.update({ id: 'default' }, patch)
    }
    const updated = await getSettings()
    res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})
