import { Router } from 'express'
import { getSettings } from '../../lib/settings.js'

// Public subset of the settings. Analytics IDs and SEO content must
// round-trip to the browser (for the <script> tags and the /robots.txt /
// /llms.txt routes on the web app). YML shop metadata (name, company, url,
// currency, delivery note) is ALSO public-safe — it describes the shop
// externally and is the same data that appears in the Yandex Market feed.
// Admin-only toggles (Yandex Pay) stay out of this response; payment
// credentials themselves never live in the DB.
export const publicSettingsRouter: Router = Router()

publicSettingsRouter.get('/', async (_req, res, next) => {
  try {
    const s = await getSettings()
    // Cache-Control set BEFORE res.json() so the header lands on the actual
    // response. (Swapping the order silently drops the header because
    // res.json() flushes headers.)
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.json({
      data: {
        metrikaId: s.metrikaId,
        ga4Id: s.ga4Id,
        robotsTxt: s.robotsTxt,
        llmsTxt: s.llmsTxt,
        yandexWebmasterVerification: s.yandexWebmasterVerification,
        googleSiteVerification: s.googleSiteVerification,
        ymlShopName: s.ymlShopName,
        ymlCompany: s.ymlCompany,
        ymlUrl: s.ymlUrl,
        ymlCurrency: s.ymlCurrency,
        ymlDeliveryNote: s.ymlDeliveryNote,
      },
    })
  } catch (err) {
    next(err)
  }
})

// Plain-text SEO endpoints. The web app's /robots.txt and /llms.txt route
// handlers proxy through these so crawlers can fetch admin-edited content at
// the site root. text/plain with charset=utf-8 so multi-byte paths in Disallow
// rules and non-ASCII characters in llms.txt render correctly.
publicSettingsRouter.get('/robots.txt', async (_req, res, next) => {
  try {
    const s = await getSettings()
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.type('text/plain; charset=utf-8').send(s.robotsTxt)
  } catch (err) {
    next(err)
  }
})

publicSettingsRouter.get('/llms.txt', async (_req, res, next) => {
  try {
    const s = await getSettings()
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.type('text/plain; charset=utf-8').send(s.llmsTxt)
  } catch (err) {
    next(err)
  }
})
