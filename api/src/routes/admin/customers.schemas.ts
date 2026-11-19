import { z } from 'zod'

export const CUSTOMERS_PAGE_SIZE = 50

export const CustomersListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
})

// Ручная правка баланса: целое со знаком, не 0, не больше 100 000 по модулю;
// requestId — ключ идемпотентности (двойной клик / повтор запроса не удвоит правку).
export const CoinAdjustSchema = z.object({
  amount: z
    .number()
    .int()
    .refine((n) => n !== 0, 'amount не может быть 0')
    .refine((n) => Math.abs(n) <= 100_000, 'amount по модулю не больше 100000'),
  comment: z.string().trim().min(3).max(500),
  requestId: z.string().uuid(),
})
