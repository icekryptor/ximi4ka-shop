import { Router } from 'express'
import { getSettings } from '../../lib/settings.js'

// Public subset of the settings. Deliberately small — analytics IDs and SEO
// content must round-trip to the browser (for the <script> tags and the
// /robots.txt and /llms.txt routes on the web app), but Yandex Pay toggle /
// mode and YML metadata are NOT exposed here. The checkout will read those
// server-to-server. Payment credentials themselves never live in the DB.
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
