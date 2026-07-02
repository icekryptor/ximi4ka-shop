import { z } from 'zod'

export const OrdersListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['pending', 'paid', 'failed', 'cancelled']).optional(),
})

// Manual transitions only: a manager can confirm an out-of-band payment or
// cancel an order. Everything else (failed, pending) is machine-owned.
export const OrderStatusPatchSchema = z.object({
  status: z.enum(['paid', 'cancelled']),
  comment: z.string().trim().max(1000).optional(),
})
