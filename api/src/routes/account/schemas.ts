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

// Те же правила, что у чекаута (checkout.schemas.ts): имя 1–255, телефон 5–64.
export const ProfilePatchSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  phone: z.string().trim().min(5).max(64).optional(),
})
