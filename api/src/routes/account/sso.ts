import { Router } from 'express'
import { z } from 'zod'
import { findCustomerSession } from '../../lib/account/session.js'
import {
  exchangeSsoCode,
  getSsoClient,
  isAllowedRedirect,
  issueSsoCode,
  secretMatches,
} from '../../lib/account/sso.js'
import { ApiError, badRequest } from '../errors.js'
import { rateLimit } from '../middleware/rateLimit.js'

// ximi4ka ID — вход в XimiLearn аккаунтом магазина
// (спека 2026-09-29-ximi4ka-id-sso-design.md §4). Упрощённый authorization
// code flow OAuth 2.0: клиент конфиденциальный (секрет живёт на его сервере),
// защита от подмены кода — state, привязанный к cookie на стороне клиента.

const AuthorizeQuery = z.object({
  client_id: z.string().regex(/^[a-z]{1,32}$/),
  redirect_uri: z.string().max(500),
  state: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
})

const TokenBody = z.object({
  client_id: z.string().regex(/^[a-z]{1,32}$/),
  client_secret: z.string().min(1).max(256),
  code: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
  redirect_uri: z.string().max(500),
})

export function createAccountSsoRouter(): Router {
  const router = Router()

  // Браузерный шаг: вошёл — сразу обратно к клиенту с кодом, нет — на
  // страницу входа магазина, которая вернёт сюда же (?next= — путь на этом
  // сайте: api и витрина за одним Caddy). Ошибки — текстом, без редиректа:
  // на непроверенный адрес возврата уводить нельзя.
  router.get(
    '/authorize',
    rateLimit({ limit: 120, windowMs: 10 * 60 * 1000 }),
    async (req, res, next) => {
      try {
        res.setHeader('Cache-Control', 'no-store')
        const parsed = AuthorizeQuery.safeParse(req.query)
        const client = parsed.success ? getSsoClient(parsed.data.client_id) : null
        if (!parsed.success || !client || !isAllowedRedirect(client, parsed.data.redirect_uri)) {
          res
            .status(400)
            .type('text/plain; charset=utf-8')
            .send('Некорректная ссылка для входа. Вернитесь на сайт и нажмите «Войти» ещё раз.')
          return
        }
        const found = await findCustomerSession(req)
        if (!found) {
          res.redirect(302, `/account/login?next=${encodeURIComponent(req.originalUrl)}`)
          return
        }
        const code = await issueSsoCode(client.id, parsed.data.redirect_uri, found.customer.id)
        const target = new URL(parsed.data.redirect_uri)
        target.searchParams.set('code', code)
        target.searchParams.set('state', parsed.data.state)
        res.redirect(302, target.toString())
      } catch (err) {
        next(err)
      }
    },
  )

  // Сервер-сервер: клиент меняет код на данные покупателя. Без cookie и CSRF —
  // аутентифицирует секрет клиента.
  router.post(
    '/token',
    rateLimit({ limit: 120, windowMs: 10 * 60 * 1000 }),
    async (req, res, next) => {
      try {
        res.setHeader('Cache-Control', 'no-store')
        const body = TokenBody.parse(req.body)
        const client = getSsoClient(body.client_id)
        if (!client || !secretMatches(client, body.client_secret)) {
          throw new ApiError(401, 'invalid_client', 'Неизвестный клиент или неверный секрет')
        }
        const identity = await exchangeSsoCode(client.id, body.redirect_uri, body.code)
        if (!identity) throw badRequest('invalid_grant', 'Код недействителен или уже использован')
        res.json({ data: identity })
      } catch (err) {
        next(err)
      }
    },
  )

  return router
}
