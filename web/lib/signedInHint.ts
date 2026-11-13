// Подсказка «покупатель, похоже, вошёл» для шапки. Сессия — HttpOnly, поэтому
// ориентируемся на читаемую CSRF-cookie: api ставит и снимает её вместе с сессией
// (api/src/lib/account/session.ts). Это только подсказка для первого кадра;
// истину проверяет getMeOrNull().
export const SIGNED_IN_COOKIE = 'ximi4ka_customer_csrf'

/** Статический скрипт для <head>/начала body: до первой отрисовки шапки ставит html[data-signed-in]. */
export const SIGNED_IN_SCRIPT = `try{if(/(?:^|;\\s*)${SIGNED_IN_COOKIE}=/.test(document.cookie))document.documentElement.dataset.signedIn='1'}catch(e){}`

export function hasSignedInCookie(): boolean {
  try {
    return new RegExp(`(?:^|;\\s*)${SIGNED_IN_COOKIE}=`).test(document.cookie)
  } catch {
    return false
  }
}

export function setSignedInAttr(on: boolean): void {
  if (on) document.documentElement.dataset.signedIn = '1'
  else delete document.documentElement.dataset.signedIn
}

/** Значение читаемой CSRF-cookie или null, если её нет. */
export function signedInCookieValue(): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${SIGNED_IN_COOKIE}=([^;]*)`))
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** Снимает устаревшую cookie (сессия на сервере уже не действует). Атрибуты — как у api (cookieBase). */
export function expireSignedInCookie(): void {
  try {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
    document.cookie = `${SIGNED_IN_COOKIE}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax${secure}`
  } catch {
    // cookie недоступны — подсказка останется до следующей загрузки
  }
}
