import { z } from 'zod'

const email = z.string().trim().toLowerCase().pipe(z.email().max(255))

export const EmailStartSchema = z.object({ email })
export const EmailVerifySchema = z.object({
  email,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Код — 6 цифр'),
})
