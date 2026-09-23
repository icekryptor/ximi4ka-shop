import { Router, type Request } from 'express'
import { getCdekClient } from '../../lib/cdek/index.js'
import { SHIPPING_RULES } from '../../lib/shipping/rates.js'
import { deliveryConfigFromEnv } from '../../lib/shipping/quote.js'
import { rateLimit } from '../middleware/rateLimit.js'

// Прокси для виджета выбора ПВЗ (@cdek-it/widget 4.x) — наш вариант
// официального dist/service.php. Протокол тот же: три действия, каждое
// проксирует один метод СДЭК от имени нашего договора. Отличия от оригинала:
//   - токен кешируется (оригинал берёт новый на каждый запрос);
//   - в СДЭК уходят только параметры с «нормальными» именами и значениями
//     (оригинал проксирует что угодно);
//   - отправитель в расчёте — всегда наш склад, а не то, что прислал браузер;
//   - в ответе калькулятора остаются только наши тарифы, и от порога
//     бесплатной доставки их цена показывается как 0 ₽. Это только витрина:
//     сколько заплатит покупатель, считает сервер в чекауте.
// Версию виджета на фронте держим точной — отдельной спецификации у этого
// протокола нет, он может поменяться с релизом виджета.

export const WIDGET_SERVICE_VERSION = '4.0.0'
const SAFE_KEY = /^[a-z_]{1,40}$/
const IGNORED = new Set(['action', 'subtotal'])
const CALC_FIELDS = ['currency', 'lang', 'to_location', 'packages', 'date', 'type'] as const

export const cdekWidgetRouter: Router = Router()

function safeQuery(src: Request['query']): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(src)) {
    if (IGNORED.has(key) || !SAFE_KEY.test(key)) continue
    if (typeof value !== 'string' || value.length > 200) continue
    out[key] = value
  }
  return out
}

function subtotalFrom(req: Request): number | null {
  const raw = req.query.subtotal
  const n = typeof raw === 'string' ? Number(raw) : NaN
  return Number.isFinite(n) && n >= 0 ? n : null
}

interface TariffListResponse {
  tariff_codes?: { tariff_code: number; delivery_sum: number }[]
}

cdekWidgetRouter.all('/', rateLimit({ limit: 240, windowMs: 60_000 }), async (req, res) => {
  const action =
    (typeof req.query.action === 'string' ? req.query.action : null) ?? req.body?.action
  const cdek = getCdekClient()
  const config = deliveryConfigFromEnv()

  try {
    let result: { status: number; headers: Record<string, string>; text: string }

    if (action === 'offices' || action === 'byCoordinate') {
      const path = action === 'offices' ? '/deliverypoints' : '/deliverypoints/byPolygons'
      result = await cdek.raw('GET', path, { query: safeQuery(req.query) })
    } else if (action === 'calculate') {
      const body: Record<string, unknown> = { from_location: { code: config.fromCityCode } }
      for (const field of CALC_FIELDS) {
        if (req.body?.[field] !== undefined) body[field] = req.body[field]
      }
      result = await cdek.raw('POST', '/calculator/tarifflist', { body })
      if (result.status === 200) {
        const parsed = JSON.parse(result.text) as TariffListResponse
        const subtotal = subtotalFrom(req)
        const freePvz = subtotal !== null && subtotal >= SHIPPING_RULES.cdek_pvz.freeFromRub
        const freeCourier = subtotal !== null && subtotal >= SHIPPING_RULES.cdek_courier.freeFromRub
        parsed.tariff_codes = (parsed.tariff_codes ?? [])
          .filter(
            (t) => t.tariff_code === config.tariffPvz || t.tariff_code === config.tariffCourier,
          )
          .map((t) =>
            (t.tariff_code === config.tariffPvz && freePvz) ||
            (t.tariff_code === config.tariffCourier && freeCourier)
              ? { ...t, delivery_sum: 0 }
              : t,
          )
        result = { ...result, text: JSON.stringify(parsed) }
      }
    } else {
      res.status(400).json({ message: 'Unknown action' })
      return
    }

    for (const [key, value] of Object.entries(result.headers)) {
      if (key.toLowerCase() !== 'x-service-version') res.setHeader(key, value)
    }
    res.setHeader('X-Service-Version', WIDGET_SERVICE_VERSION)
    res.status(result.status).type('application/json').send(result.text)
  } catch {
    res.setHeader('X-Service-Version', WIDGET_SERVICE_VERSION)
    res
      .status(502)
      .json({ error: { code: 'cdek_unavailable', message: 'СДЭК временно недоступен' } })
  }
})
