import { z } from 'zod'
import { normalizeTelegramHandle } from '../lib/telegramHandle.js'

const comment = z.string().trim().max(1000).optional()

// Доставка приходит из полей чекаута. Для ПВЗ обязательны код пункта и код
// города — без них не создать заказ в СДЭК. Курьеру хватает адреса; код
// города и индекс уточняют расчёт, если есть.
const PvzDeliverySchema = z.object({
  method: z.literal('cdek_pvz'),
  cityCode: z.number().int().positive(),
  deliveryPointCode: z.string().trim().min(1).max(32),
  address: z.string().trim().min(1).max(1000),
  comment,
})

const CourierDeliverySchema = z.object({
  method: z.literal('cdek_courier'),
  cityCode: z.number().int().positive().optional(),
  postalCode: z.string().trim().max(16).optional(),
  address: z.string().trim().min(1).max(1000),
  comment,
})

export const DeliverySchema = z.discriminatedUnion('method', [
  PvzDeliverySchema,
  CourierDeliverySchema,
])

// Для расчёта цены ПВЗ код пункта не нужен (QuoteDestination в shared):
// чекаут показывает цену сразу после выбора города.
export const QuoteDestinationSchema = z.discriminatedUnion('method', [
  PvzDeliverySchema.extend({
    deliveryPointCode: PvzDeliverySchema.shape.deliveryPointCode.optional(),
  }),
  CourierDeliverySchema,
])

// Атрибуция приходит от клиента и ничему не обязана соответствовать: строки
// режем по длине, пустые выкидываем, а всё кривое молча отбрасываем. Заказ
// из-за неё сорваться не должен (как и из-за подарка).
// Управляющие символы и одинокие суррогаты (эмодзи, разрезанный обрезкой)
// Postgres в jsonb не принимает: заказ упал бы с 500, а у покупателя с такой
// меткой в localStorage — все 30 дней. Режем по кодовым точкам, а не по UTF-16.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g
function cleanText(value: string, max: number): string {
  const clean = value
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(LONE_SURROGATE, '')
    .trim()
  return Array.from(clean).slice(0, max).join('').trim()
}

const clipped = (max: number) => z.string().transform((s) => cleanText(s, max))
const optionalClipped = (max: number) =>
  clipped(max)
    .optional()
    .catch(undefined)
    .transform((v) => (v === '' ? undefined : v))
const requiredClipped = (max: number) => clipped(max).refine((s) => s !== '')

const AttributionTouchSchema = z
  .object({
    at: requiredClipped(40),
    landing: requiredClipped(300),
    referrer: optionalClipped(300),
    yclid: optionalClipped(100),
    ysclid: optionalClipped(100),
    utm_source: optionalClipped(200),
    utm_medium: optionalClipped(200),
    utm_campaign: optionalClipped(200),
    utm_term: optionalClipped(200),
    utm_content: optionalClipped(200),
  })
  .transform((touch) =>
    Object.fromEntries(Object.entries(touch).filter(([, v]) => v !== undefined)),
  )
  .optional()
  .catch(undefined)

const AttributionSchema = z
  .object({ first: AttributionTouchSchema, last: AttributionTouchSchema })
  .transform(({ first, last }) => {
    if (!first && !last) return undefined
    return { ...(first ? { first } : {}), ...(last ? { last } : {}) }
  })
  .optional()
  .catch(undefined)

// Client prices are never trusted — the schema deliberately has no price
// fields; the route recomputes everything from the products table.
export const CheckoutSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(50),
  // Подарок на выбор; условия (порог, список реактивов, наличие) проверяет loadGift.
  // Битое значение — это «без подарка»: подарок не должен срывать заказ.
  giftProductId: z.string().uuid().optional().catch(undefined),
  customer: z.object({
    name: z.string().trim().min(1).max(255),
    phone: z.string().trim().min(5).max(64),
    email: z.string().trim().email().max(255).optional(),
    telegram: z
      .string()
      .trim()
      .max(64)
      .optional()
      .transform((value, ctx) => {
        if (!value) return undefined
        const handle = normalizeTelegramHandle(value)
        if (!handle) {
          ctx.addIssue({ code: 'custom', message: 'Telegram: 5–32 латинских букв, цифр или _' })
          return z.NEVER
        }
        return handle
      }),
  }),
  delivery: DeliverySchema,
  attribution: AttributionSchema,
})

export type CheckoutInput = z.infer<typeof CheckoutSchema>
