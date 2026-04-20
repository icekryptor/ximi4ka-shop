import { z } from 'zod'

export const LoginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(255),
  password: z.string().min(1).max(1024),
})

export type LoginInput = z.infer<typeof LoginSchema>
