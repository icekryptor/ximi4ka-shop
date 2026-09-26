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
})

export type CheckoutInput = z.infer<typeof CheckoutSchema>
