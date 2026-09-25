import { z } from 'zod'

export const OrdersListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['pending', 'paid', 'shipped', 'failed', 'cancelled']).optional(),
})

// Только ручные переходы: менеджер подтверждает оплату мимо Т-Кассы, отменяет
// заказ или отмечает оплаченный заказ отправленным. failed и pending ставит
// только система.
export const OrderStatusPatchSchema = z.object({
  status: z.enum(['paid', 'cancelled', 'shipped']),
  comment: z.string().trim().max(1000).optional(),
})
