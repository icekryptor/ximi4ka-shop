import { z } from 'zod'

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
  delivery: z.object({
    method: z.enum(['cdek_pvz', 'cdek_courier']),
    address: z.string().trim().min(1).max(1000),
    comment: z.string().trim().max(1000).optional(),
  }),
})

export type CheckoutInput = z.infer<typeof CheckoutSchema>
