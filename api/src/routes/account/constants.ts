// Личный кабинет покупателя (спека 2026-09-28-customer-account-design.md).
// Имена cookie не пересекаются с админскими: это независимые сессии.
export const CUSTOMER_SESSION_COOKIE = 'ximi4ka_customer_session'
export const CUSTOMER_CSRF_COOKIE = 'ximi4ka_customer_csrf'
export const TG_POLL_COOKIE = 'ximi4ka_customer_tg_poll'

export const CUSTOMER_SESSION_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000

export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000
export const EMAIL_CODE_MAX_ATTEMPTS = 5
export const EMAIL_RESEND_INTERVAL_MS = 60 * 1000
export const EMAIL_MAX_PER_HOUR = 5

export const TG_LOGIN_TTL_MS = 10 * 60 * 1000

export const SUPPORT_TELEGRAM_URL = 'https://t.me/ximi4ka_support'
