import { afterEach, describe, it, expect, vi } from 'vitest'
import { ApiError } from './api'
import { getMeOrNull, updateMe, verifyEmailLogin } from './accountApi'

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
})
