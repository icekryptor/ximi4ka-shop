import { z } from 'zod'

// Входные данные методов YCP (docs/ycp/ycp-openapi-0.0.14.json). Поля, которые
// спецификация называет обязательными, но в своих же примерах опускает, здесь
// необязательны: отказ на них выключил бы кнопку.

// limit/offset обязательны по спецификации; без них отдаём первую страницу.
export const PageQuerySchema = z.object({
  limit: z.coerce.number().int().min(0).max(10_000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
})

// Позиция корзины. id — строка до 80 символов, как offer id фида; не-uuid
// не ошибка: такого товара просто нет в ответе.
export const ItemRefSchema = z.object({
  id: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1).max(10_000),
})

export const BasketCheckSchema = z.object({
  items: z.array(ItemRefSchema).min(1).max(100),
  // Обязательны по схеме, но пример запроса Яндекса их опускает. Ответ от них
  // не зависит: id у нас один и тот же в обоих режимах, остаток не региональный,
  // проверка здоровья отвечает как настоящий запрос.
  offers_id_from_merchant_center: z.boolean().optional(),
  locality: z.string().max(255).optional(),
  is_health_check: z.boolean().optional(),
})

const optionalText = (max: number) => z.string().trim().max(max).optional()

export const AddressSchema = z.object({
  locality: optionalText(255),
  address: optionalText(1000),
  apartment: optionalText(64),
  entrance: optionalText(64),
  floor: optionalText(64),
  intercom: optionalText(64),
  pickup_point_id: optionalText(32),
})

export type YcpAddress = z.infer<typeof AddressSchema>

// Поля адреса в схеме Яндекса все необязательны, но по описанию для ПВЗ нужен
// pickup_point_id, а для курьера и самовывоза — locality и address. Без них
// калькулятор СДЭК получил бы поладреса.
export function checkAddressFor(
  method: string,
  address: YcpAddress,
  report: (path: string[], message: string) => void,
): void {
  if (method === 'pickup_point') {
    if (!address.pickup_point_id) {
      report(['address', 'pickup_point_id'], 'pickup_point_id is required for pickup_point')
    }
    return
  }
  if (!address.locality || !address.address) {
    report(['address'], 'locality and address are required')
  }
}

export const DeliveryOptionsSchema = z.object({
  items: z.array(ItemRefSchema).min(1).max(100),
  delivery_target: z
    .object({ delivery_method: z.enum(['pickup_point', 'courier']), address: AddressSchema })
    .superRefine((v, ctx) =>
      checkAddressFor(v.delivery_method, v.address, (path, message) =>
        ctx.addIssue({ code: 'custom', path, message }),
      ),
    ),
})

const PricedItemSchema = ItemRefSchema.extend({
  regular_price: z.number().int().min(0),
  final_price: z.number().int().min(0),
})

const IntervalSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().max(16).optional(),
})

export const CreateCheckoutSchema = z.object({
  session_id: z.string().trim().min(1).max(64),
  warehouse_id: z.string().trim().min(1).max(64),
  items: z.array(PricedItemSchema).min(1).max(100),
  customer: z.object({
    full_name: z.string().trim().min(1).max(255),
    phone: z.string().trim().min(5).max(64),
    email: z.string().trim().email().max(255),
  }),
  delivery: z
    .object({
      delivery_method: z.enum(['courier', 'pickup_point', 'self_pickup']),
      service_type: z.string().trim().max(32),
      service_display_name: optionalText(255),
      price: z.number().min(0).max(1_000_000),
      address: AddressSchema,
      // time_zone обязателен по схеме, но в примерах Яндекса его нет.
      delivery_date_interval: z.object({
        start_interval: IntervalSchema,
        end_interval: IntervalSchema,
        time_zone: z.number().int().optional(),
      }),
      ycp_delivery_option_id: optionalText(64),
      delivery_notes: optionalText(1000),
    })
    .superRefine((v, ctx) =>
      checkAddressFor(v.delivery_method, v.address, (path, message) =>
        ctx.addIssue({ code: 'custom', path, message }),
      ),
    ),
})

// Тело — контракт; query-параметры устарели, но обязательны по схеме, поэтому
// принимаем оба источника (тело важнее). Деньги к этому моменту уже у Яндекса,
// поэтому к безобидному дрейфу формы терпимы: order_number мы не используем,
// способ оплаты и acquiring_id — только для истории и привязки платежа.
// payment_method остаётся строгим: от него зависит, оплачен ли заказ.
export const CheckoutPlacedSchema = z.object({
  session_id: z.string().trim().min(1).max(64),
  order_id: z.string().trim().min(1).max(64),
  order_number: z.unknown().optional(),
  payment_method: z.enum(['online', 'on_delivery']),
  online_payment_method: z.string().trim().max(64).nullish(),
  acquiring_id: z.string().trim().max(255).nullish(),
})

export const SessionQuerySchema = z.object({ session_id: z.string().trim().min(1).max(64) })
export const OrderQuerySchema = z.object({ order_id: z.string().trim().min(1).max(64) })
