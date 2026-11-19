import { Router } from 'express'
import { z } from 'zod'
import { ANALYTICS_EVENT_TYPES } from '@ximi4ka-shop/shared/types/analytics'
import { AppDataSource } from '../../config/dataSource.js'

// Приём событий собственной аналитики витрины: цели (add_to_cart, open_cart, ...)
// и полевые Web Vitals (web_vital, по событию на метрику за загрузку страницы).
// Публичный и анонимный, поэтому: белый список типов, жёсткие размеры, лимит
// частоты на уровне app.ts и тихий отброс ботов. IP и User-Agent не храним.
const MAX_META_CHARS = 1000
const MAX_PATH_CHARS = 300

// Postgres не хранит NUL ни в text, ни в jsonb, а jsonb ещё и отвергает одиночные
// суррогаты (в JSON.stringify они выходят как \ud800..\udfff; корректная пара,
// например эмодзи, остаётся самим символом). Такие входы — 400, а не 500.
const JSON_UNSTORABLE = /\\u0000|\\ud[89a-f][0-9a-f]{2}/i

// Обрезка по code unit может разрезать суррогатную пару: хвостовой одинокий
// старший суррогат отбрасываем, чтобы в базу попал валидный текст.
function truncatePath(p: string): string {
  const cut = p.slice(0, MAX_PATH_CHARS)
  const last = cut.charCodeAt(cut.length - 1)
  return p.length > MAX_PATH_CHARS && last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut
}

const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|curl|wget|python-requests|httpclient/i

const EventSchema = z.object({
  type: z.enum(ANALYTICS_EVENT_TYPES),
  visitorId: z.uuid(),
  // Длинный путь не повод отказывать: режем до колонки.
  path: z
    .string()
    .min(1)
    .max(2000)
    .refine((p) => !p.includes('\u0000'), { message: 'path содержит NUL' })
    .transform(truncatePath),
  meta: z
    .record(z.string(), z.unknown())
    .refine((m) => JSON.stringify(m).length <= MAX_META_CHARS, { message: 'meta слишком большой' })
    .refine((m) => !JSON_UNSTORABLE.test(JSON.stringify(m)), {
      message: 'meta содержит NUL или одиночный суррогат',
    })
    .optional(),
})

export function createEventsRouter(): Router {
  const router = Router()

  // POST /api/public/events
  router.post('/', async (req, res, next) => {
    try {
      const event = EventSchema.parse(req.body)
      // Бота не пугаем ошибкой, просто не пишем: его «клики» не нужны в статистике.
      if (BOT_UA.test(req.get('user-agent') ?? '')) {
        res.status(204).end()
        return
      }
      await AppDataSource.query(
        `INSERT INTO analytics_events (type, visitor_id, path, meta) VALUES ($1, $2, $3, $4)`,
        [event.type, event.visitorId, event.path, event.meta ? JSON.stringify(event.meta) : null],
      )
      res.status(204).end()
    } catch (err) {
      next(err)
    }
  })

  return router
}
