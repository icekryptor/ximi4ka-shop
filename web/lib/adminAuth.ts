// Admin auth helpers. Shared between the admin layout (server-side session
// check), the login page, and the admin shell logout handler.
//
// Keep both URLs here so swapping envs only requires one edit: the server-side
// reads API_URL (prefers internal service URL), the client-side reads
// NEXT_PUBLIC_API_URL (must be reachable from the browser).

export const ADMIN_API_URL_SERVER =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export const ADMIN_API_URL_CLIENT =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export const CSRF_COOKIE_NAME = 'ximi4ka_shop_csrf'

export interface AdminUserPublic {
  id: string
  email: string
  role: string
}

export function readCsrfTokenFromDocument(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)ximi4ka_shop_csrf=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}
