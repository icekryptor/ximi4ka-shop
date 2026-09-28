import { cookies } from 'next/headers'
import type { AuthConfig, CustomerProfile } from '@ximi4ka-shop/shared'

// Серверная проверка сессии для страниц кабинета (как admin layout).
// cache: 'no-store' обязателен — закешированный 401 выкидывал бы только что вошедшего.
const API = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export async function fetchCurrentCustomer(): Promise<CustomerProfile | null> {
  const cookieHeader = (await cookies()).toString()
  if (!cookieHeader.includes('ximi4ka_customer_session=')) return null
  try {
    const res = await fetch(`${API}/api/account/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return ((await res.json()) as { data: CustomerProfile }).data
  } catch {
    return null
  }
}

export async function fetchAuthConfigServer(): Promise<AuthConfig> {
  try {
    const res = await fetch(`${API}/api/account/auth/config`, { cache: 'no-store' })
    if (res.ok) return ((await res.json()) as { data: AuthConfig }).data
  } catch {
    // api недоступен — покажем почту, ошибка всплывёт при отправке.
  }
  return { email: true, telegram: false, telegramBot: null }
}
