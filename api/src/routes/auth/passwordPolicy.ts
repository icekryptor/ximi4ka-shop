import { ApiError, badRequest } from '../errors.js'
import { DEFAULT_SEED_PASSWORD, MIN_PASSWORD_LENGTH } from './constants.js'

// Проверка нового пароля админа. Длина считается символами (кодовыми точками),
// а не единицами UTF-16: шесть эмодзи — это шесть, а не двенадцать. Пробелы по
// краям не обрезаются: пароль принимается как введён. Возвращает ошибку для
// ответа или null, если пароль годится.
export function checkNewPassword(
  newPassword: string,
  currentPassword: string,
  email: string,
): ApiError | null {
  if ([...newPassword].length < MIN_PASSWORD_LENGTH) {
    return badRequest(
      'password_too_short',
      `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`,
    )
  }
  if (newPassword === currentPassword) {
    return badRequest('password_unchanged', 'Новый пароль совпадает с текущим')
  }
  if (newPassword === DEFAULT_SEED_PASSWORD) {
    return badRequest('password_too_common', 'Этот пароль общеизвестен, выберите другой')
  }
  if (
    newPassword.trim() === '' ||
    /^(.)\1*$/su.test(newPassword) ||
    newPassword.toLowerCase() === email.toLowerCase()
  ) {
    return badRequest('password_too_weak', 'Пароль слишком простой: придумайте другой')
  }
  return null
}
