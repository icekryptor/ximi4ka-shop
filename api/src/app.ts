import express, { type Express, type RequestHandler, type Router } from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { publicProductsRouter } from './routes/public/products.js'
import { adminProductsRouter } from './routes/admin/products.js'
import { publicCategoriesRouter } from './routes/public/categories.js'
import { adminCategoriesRouter } from './routes/admin/categories.js'
import { publicPagesRouter } from './routes/public/pages.js'
import { adminPagesRouter } from './routes/admin/pages.js'
import { publicBlogRouter } from './routes/public/blog.js'
import { adminBlogRouter } from './routes/admin/blog.js'
import { publicSearchRouter } from './routes/public/search.js'
import { mediaRouter } from './routes/admin/media.js'
import { adminRedirectsRouter } from './routes/admin/redirects.js'
import { publicRedirectsRouter } from './routes/public/redirects.js'
import { adminRevisionsRouter } from './routes/admin/revisions.js'
import { adminSettingsRouter } from './routes/admin/settings.js'
import { publicSettingsRouter } from './routes/public/settings.js'
import { authRouter } from './routes/auth/index.js'
import { createAccountRouter } from './routes/account/index.js'
import { createTelegramWebhookRouter } from './routes/telegram/loginWebhook.js'
import { checkoutRouter } from './routes/checkout.js'
import { tbankWebhookRouter } from './routes/webhooks/tbank.js'
import { publicOrdersRouter } from './routes/public/orders.js'
import { adminOrdersRouter } from './routes/admin/orders.js'
import { publicShippingRouter } from './routes/public/shipping.js'
import { cdekWidgetRouter } from './routes/public/cdek-widget.js'
import { cdekLocationsRouter } from './routes/public/cdek-locations.js'
import { errorHandler } from './routes/errors.js'
import { rateLimit } from './routes/middleware/rateLimit.js'
import { UPLOADS_DIR } from './lib/storage/index.js'
import { getLoginPollerHealth } from './lib/telegram/loginPoller.js'

// Лимит из env (число запросов на окно); пусто, мусор и значения выше потолка —
// по умолчанию, чтобы опечатка в app.env не отключила защиту молча. Читаем в
// момент createApp, а не при импорте: тесты задают свои значения.
const MAX_ENV_LIMIT = 1000
function envLimit(name: string, fallback: number): number {
  const n = Number(process.env[name])
  return Number.isInteger(n) && n > 0 && n <= MAX_ENV_LIMIT ? n : fallback
}

// Лимитер вешаем на тот же префикс через Router, а не отдельным app.post с
// полным путём: app.use срезает префикс вместе со слешем, и `/api/auth//login`
// доходит до роутера, минуя app.post('/api/auth/login'). Через Router
// пути сопоставляются по тем же правилам, что у настоящего обработчика.
function guard(path: string, limiter: RequestHandler): Router {
  const router = express.Router()
  router.post(path, limiter)
  return router
}

export function createApp(): Express {
  const app = express()

  // За Caddy: доверяем X-Forwarded-For только от адресов из частных сетей
  // (docker-сеть, localhost) — снаружи этот заголовок подделать нельзя. Без
  // этого req.ip — адрес Caddy, и лимит частоты бил бы всех разом.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal')

  // CORS — the web app (http://localhost:3000 in dev) and the api
  // (http://localhost:3001) live on different origins. Login sets HttpOnly
  // cookies that must round-trip to the browser, so we need credentials: true.
  app.use(
    cors({
      origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
      credentials: true,
    }),
  )

  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true })
  })

  // Отдельно от /health: тот остаётся «процесс жив» для Docker, а этот — «бот
  // входа получает сообщения от Telegram» (для внешнего мониторинга). Под
  // /api, иначе Caddy отдаст путь витрине (см. Caddyfile.snippet). В режиме
  // вебхука polling:false — доставку вебхука этот маршрут не проверяет.
  app.get('/api/health/telegram', (_req, res) => {
    const h = getLoginPollerHealth()
    res.status(h.healthy ? 200 : 503).json({
      ok: h.healthy,
      polling: h.running,
      lastOkAt: h.lastOkAt === null ? null : new Date(h.lastOkAt).toISOString(),
    })
  })

  // Вход в админку: argon2 жрёт CPU, а пароль можно перебирать. Лимит на IP
  // ставим до роутера, только на сам логин (me/logout его не касаются).
  app.use(
    '/api/auth',
    guard(
      '/login',
      rateLimit({ limit: envLimit('LOGIN_RATE_LIMIT', 10), windowMs: 15 * 60 * 1000 }),
    ),
  )
  app.use('/api/auth', authRouter)
  app.use('/api/account', createAccountRouter())
  app.use('/api/telegram', createTelegramWebhookRouter())
  // Заказ анонимный и создаёт платёж в Т-Кассе: без лимита его можно засыпать
  // фейковыми заказами. 20 в час с IP хватает школе или офису за одним NAT.
  app.use(
    '/api/checkout',
    guard('/', rateLimit({ limit: envLimit('CHECKOUT_RATE_LIMIT', 20), windowMs: 60 * 60 * 1000 })),
  )
  app.use('/api/checkout', checkoutRouter)
  app.use('/api/webhooks/tbank', tbankWebhookRouter)
  app.use('/api/public/orders', publicOrdersRouter)
  app.use('/api/admin/orders', adminOrdersRouter)
  app.use('/api/public/products', publicProductsRouter)
  app.use('/api/admin/products', adminProductsRouter)
  app.use('/api/public/categories', publicCategoriesRouter)
  app.use('/api/admin/categories', adminCategoriesRouter)
  app.use('/api/public/pages', publicPagesRouter)
  app.use('/api/admin/pages', adminPagesRouter)
  app.use('/api/public/blog', publicBlogRouter)
  app.use('/api/admin/blog', adminBlogRouter)
  app.use('/api/public/search', publicSearchRouter)
  app.use('/api/admin/media', mediaRouter)
  app.use('/api/public/redirects', publicRedirectsRouter)
  app.use('/api/public/shipping', publicShippingRouter)
  app.use('/api/public/cdek/widget', cdekWidgetRouter)
  app.use('/api/public/cdek', cdekLocationsRouter)
  app.use('/api/admin/redirects', adminRedirectsRouter)
  app.use('/api/admin/revisions', adminRevisionsRouter)
  app.use('/api/public/settings', publicSettingsRouter)
  app.use('/api/admin/settings', adminSettingsRouter)

  // Serve uploaded files statically. UPLOADS_DIR is resolved relative to the
  // storage module, not process.cwd(), so it behaves consistently whether
  // launched from the repo root or from api/ via `npm run dev -w api`.
  app.use('/uploads', express.static(UPLOADS_DIR))

  app.use(errorHandler)

  return app
}
