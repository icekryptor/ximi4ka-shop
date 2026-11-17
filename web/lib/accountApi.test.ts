import { afterEach, describe, it, expect, vi } from 'vitest'
import { ApiError } from './api'
import {
  getMeOrNull,
  getMeSession,
  startEmailLogin,
  updateMe,
  verifyEmailLogin,
} from './accountApi'

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = 'ximi4ka_customer_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
})

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('accountApi', () => {
  it('изменения шлют cookie и X-CSRF-Token', async () => {
    document.cookie = 'ximi4ka_customer_csrf=abc; path=/'
    const f = vi.fn(async () => json(200, { data: { id: '1' } }))
    vi.stubGlobal('fetch', f)
    await updateMe({ name: 'Иван' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/account\/me$/)
    expect(init.method).toBe('PATCH')
    expect(init.credentials).toBe('include')
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('abc')
  })

  it('запрос кода: берёт задачу ALTCHA, решает её и отправляет решение вместе с почтой', async () => {
    const { createChallenge, verifySolution } = await import('altcha-lib')
    const { deriveKey } = await import('altcha-lib/algorithms/web/pbkdf2')
    const secret = 'test-secret'
    const challenge = await createChallenge({
      algorithm: 'PBKDF2/SHA-256',
      cost: 1,
      deriveKey,
      hmacSignatureSecret: secret,
    })
    const f = vi.fn(async (url: string) =>
      url.endsWith('/email/challenge')
        ? json(200, { data: challenge })
        : new Response(null, { status: 204 }),
    )
    vi.stubGlobal('fetch', f)
    await startEmailLogin('ivan@example.com')

    const [challengeUrl] = f.mock.calls[0] as unknown as [string]
    expect(challengeUrl).toMatch(/\/api\/account\/auth\/email\/challenge$/)
    const [startUrl, init] = f.mock.calls[1] as unknown as [string, RequestInit]
    expect(startUrl).toMatch(/\/api\/account\/auth\/email\/start$/)
    const body = JSON.parse(init.body as string) as { email: string; altcha: string }
    expect(body.email).toBe('ivan@example.com')
    const payload = JSON.parse(atob(body.altcha))
    const result = await verifySolution({
      challenge: payload.challenge,
      solution: payload.solution,
      deriveKey,
      hmacSignatureSecret: secret,
    })
    expect(result.verified).toBe(true)
  })

  it('ошибка api — ApiError с кодом и деталями', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(400, {
          error: { code: 'invalid_code', message: 'Неверный код', details: { attemptsLeft: 3 } },
        }),
      ),
    )
    const err = await verifyEmailLogin('a@b.ru', '000000').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 400, code: 'invalid_code', details: { attemptsLeft: 3 } })
  })

  it('getMeOrNull: 401 и сетевая ошибка — null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(401, { error: { code: 'auth_required' } })),
    )
    expect(await getMeOrNull()).toBeNull()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    )
    expect(await getMeOrNull()).toBeNull()
  })

  it('getMeSession: профиль — ok, 401 — unauthorized, 500 и сеть — error', async () => {
    const me = { name: 'Р', email: null, coinBalance: 1 }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { data: me })),
    )
    expect(await getMeSession()).toEqual({ status: 'ok', me })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(401, { error: { code: 'auth_required' } })),
    )
    expect(await getMeSession()).toEqual({ status: 'unauthorized' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(500, { error: { code: 'internal' } })),
    )
    expect(await getMeSession()).toEqual({ status: 'error' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    )
    expect(await getMeSession()).toEqual({ status: 'error' })
  })
})
