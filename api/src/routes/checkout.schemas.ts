import { z } from 'zod'

const comment = z.string().trim().max(1000).optional()

// Доставка приходит из виджета СДЭК. Для ПВЗ обязательны код пункта и код
// города — без них не создать заказ в СДЭК. Курьеру хватает адреса, который
// виджет геокодировал; код города и индекс уточняют расчёт, если есть.
export const DeliverySchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('cdek_pvz'),
    cityCode: z.number().int().positive(),
    deliveryPointCode: z.string().trim().min(1).max(32),
    address: z.string().trim().min(1).max(1000),
    comment,
  }),
  z.object({
    method: z.literal('cdek_courier'),
    cityCode: z.number().int().positive().optional(),
    postalCode: z.string().trim().max(16).optional(),
    address: z.string().trim().min(1).max(1000),
    comment,
  }),
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
  }),
  delivery: DeliverySchema,
})

export type CheckoutInput = z.infer<typeof CheckoutSchema>
