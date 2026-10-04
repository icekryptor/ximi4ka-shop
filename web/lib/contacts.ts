// Контакты магазина (предоставлены владельцем). Единственный источник для
// JSON-LD; футер потом берёт значения отсюда же. Адрес и юрлицо не добавляем.
export const PHONE = '+79859938311'
export const EMAIL = 'info@ximi4ka.ru'

/** Чат поддержки в Telegram. */
export const SUPPORT_URL = 'https://t.me/ximi4ka_support'

/** Публичные профили бренда — для schema.org `sameAs`. */
export const SOCIAL_URLS = [
  'https://t.me/ximi4kapublic',
  'https://www.instagram.com/ximi4kaaa/',
  'https://www.tiktok.com/@ximi4ka',
  'https://www.youtube.com/@chemxenia',
] as const
