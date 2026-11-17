import type {
  AccountCoins,
  AccountMaterial,
  AccountOrdersPage,
  AuthConfig,
  CustomerProfile,
  TelegramLoginPoll,
  TelegramLoginStart,
} from '@ximi4ka-shop/shared'
import { solveChallenge, type Challenge } from 'altcha-lib'
import { deriveKey as pbkdf2DeriveKey } from 'altcha-lib/algorithms/web/pbkdf2'
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
// Перед письмом с кодом браузер решает задачу ALTCHA (защита от ботов, которые
// подставляли в форму чужие адреса, — см. api/src/lib/account/altcha.ts). Человек
// ничего не видит: доля секунды на ноутбуке, около секунды на слабом телефоне.
export async function startEmailLogin(email: string): Promise<void> {
  const challenge = await call<Challenge>('/api/account/auth/email/challenge')
  const solution = await solveChallenge({ challenge, deriveKey: pbkdf2DeriveKey, timeout: 30_000 })
  if (!solution) {
    throw new ApiError(400, 'captcha_failed', 'Проверка не прошла — попробуйте ещё раз')
  }
  const altcha = btoa(JSON.stringify({ challenge, solution }))
  return post<void>('/api/account/auth/email/start', { email, altcha })
}
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

export type MeSession =
  | { status: 'ok'; me: CustomerProfile }
  | { status: 'unauthorized' }
  | { status: 'error' }

// Как getMeOrNull, но отличает «сессии нет» (401) от сбоя сети/сервера: шапка при 401
// снимает устаревшую подсказку о входе, а при сбое ничего не трогает.
export async function getMeSession(): Promise<MeSession> {
  try {
    return { status: 'ok', me: await getMe() }
  } catch (err) {
    return err instanceof ApiError && err.status === 401
      ? { status: 'unauthorized' }
      : { status: 'error' }
  }
}
export const updateMe = (patch: { name?: string; phone?: string }) =>
  call<CustomerProfile>('/api/account/me', { method: 'PATCH', body: JSON.stringify(patch) })
export const getOrders = (cursor?: string | null) =>
  call<AccountOrdersPage>(
    `/api/account/orders${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
  )
export const getCoins = () => call<AccountCoins>('/api/account/coins')
export const getMaterials = () => call<AccountMaterial[]>('/api/account/materials')

export const startLinkEmail = (email: string) =>
  post<void>('/api/account/link/email/start', { email })
export const verifyLinkEmail = (email: string, code: string) =>
  post<{ ok: true }>('/api/account/link/email/verify', { email, code })
export const startLinkTelegram = () => post<TelegramLoginStart>('/api/account/link/telegram/start')
export const unlinkEmail = () => post<void>('/api/account/email/unlink')
export const unlinkTelegram = () => post<void>('/api/account/telegram/unlink')
