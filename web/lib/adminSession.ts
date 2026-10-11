import { cookies } from 'next/headers'
import { ADMIN_API_URL_SERVER, type AdminUserPublic } from '@/lib/adminAuth'

// Серверная проверка сессии админки. Вызывается на каждом запросе к любой
// странице /admin/(authed). `cache: 'no-store'` обязателен: закешированный 401
// отправил бы только что вошедшего обратно на /admin/login.
export async function fetchCurrentAdmin(): Promise<AdminUserPublic | null> {
  const store = await cookies()
  const cookieHeader = store.toString()
  if (!cookieHeader) return null
  try {
    const res = await fetch(`${ADMIN_API_URL_SERVER}/api/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const body = (await res.json()) as { data: AdminUserPublic }
    return body.data
  } catch {
    return null
  }
}
