import { z } from 'zod'
import { MAX_PASSWORD_LENGTH } from './constants.js'

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(1024),
})

export type LoginInput = z.infer<typeof LoginSchema>

// Содержательные проверки нового пароля (длина, совпадение с текущим и с
// паролем сида) делает обработчик, чтобы вернуть понятное сообщение по-русски;
// здесь только форма и верхняя граница.
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().max(MAX_PASSWORD_LENGTH),
})

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>
