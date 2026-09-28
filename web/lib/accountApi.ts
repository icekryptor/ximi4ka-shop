import type {
  AccountOrdersPage,
  AuthConfig,
  CustomerProfile,
  TelegramLoginPoll,
  TelegramLoginStart,
} from '@ximi4ka-shop/shared'
import { ApiError } from './api'

// Клиент личного кабинета для браузера. Как adminApi.ts: cookie сессии
// покупателя (credentials: 'include') и X-CSRF-Token на изменениях.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

function readCsrf(): string {
  if (typeof document === 'undefined') return ''
  const m = document.cookie.match(/(?:^|;\s*)ximi4ka_customer_csrf=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  }
  if (isMutation) {
    const csrf = readCsrf()
    if (csrf) headers['X-CSRF-Token'] = csrf
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string; details?: unknown }
    } | null
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'unknown',
      body?.error?.message ?? `Request failed with status ${res.status}`,
      body?.error?.details,
    )
  }
  if (res.status === 204) return undefined as T
  return ((await res.json()) as { data: T }).data
}

const post = <T>(path: string, body?: unknown) =>
  call<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

export const getAuthConfig = () => call<AuthConfig>('/api/account/auth/config')
export const startEmailLogin = (email: string) =>
  post<void>('/api/account/auth/email/start', { email })
export const verifyEmailLogin = (email: string, code: string) =>
  post<{ ok: true }>('/api/account/auth/email/verify', { email, code })
export const startTelegramLogin = () => post<TelegramLoginStart>('/api/account/auth/telegram/start')
export const pollTelegramLogin = () => call<TelegramLoginPoll>('/api/account/auth/telegram/status')
export const logout = () => post<void>('/api/account/auth/logout')

export const getMe = () => call<CustomerProfile>('/api/account/me')
export async function getMeOrNull(): Promise<CustomerProfile | null> {
  try {
    return await getMe()
  } catch {
    return null
  }
}
export const updateMe = (patch: { name?: string; phone?: string }) =>
  call<CustomerProfile>('/api/account/me', { method: 'PATCH', body: JSON.stringify(patch) })
export const getOrders = (cursor?: string | null) =>
  call<AccountOrdersPage>(
    `/api/account/orders${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
  )

export const startLinkEmail = (email: string) =>
  post<void>('/api/account/link/email/start', { email })
export const verifyLinkEmail = (email: string, code: string) =>
  post<{ ok: true }>('/api/account/link/email/verify', { email, code })
export const startLinkTelegram = () => post<TelegramLoginStart>('/api/account/link/telegram/start')
export const unlinkEmail = () => post<void>('/api/account/email/unlink')
export const unlinkTelegram = () => post<void>('/api/account/telegram/unlink')
