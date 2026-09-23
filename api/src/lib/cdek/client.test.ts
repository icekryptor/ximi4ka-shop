import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CdekClient, CdekError, PUBLIC_TEST_CREDENTIALS } from './client.js'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const token = (value = 'tok-1', expiresIn = 3599) =>
  json(200, { access_token: value, token_type: 'bearer', expires_in: expiresIn })

describe('CdekClient — токен', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    fetchMock = vi.fn()
  })

  it('берёт токен по client_credentials формой и шлёт его Bearer-заголовком', async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(json(200, { ok: 1 }))
    const client = new CdekClient({
      baseUrl: 'https://api.edu.cdek.ru/v2',
      clientId: 'id',
      clientSecret: 'secret',
      fetch: fetchMock,
    })
    await client.get('/deliverypoints', { city_code: 44 })

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]
    expect(String(tokenUrl)).toBe('https://api.edu.cdek.ru/v2/oauth/token')
    expect(tokenInit.method).toBe('POST')
    expect(String(tokenInit.body)).toBe(
      'grant_type=client_credentials&client_id=id&client_secret=secret',
    )

    const [url, init] = fetchMock.mock.calls[1]
    expect(String(url)).toBe('https://api.edu.cdek.ru/v2/deliverypoints?city_code=44')
    expect(init.headers.Authorization).toBe('Bearer tok-1')
  })

  it('переиспользует токен, пока он не истёк', async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValue(json(200, {}))
    const client = new CdekClient({
      baseUrl: 'https://x/v2',
      clientId: 'a',
      clientSecret: 'b',
      fetch: fetchMock,
    })
    await client.get('/a')
    await client.get('/b')
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/oauth/token'))).toHaveLength(1)
  })

  it('берёт новый токен, когда старый истекает (с запасом в минуту)', async () => {
    let now = 0
    fetchMock
      .mockResolvedValueOnce(token('t1', 120))
      .mockResolvedValueOnce(json(200, {}))
      .mockResolvedValueOnce(token('t2', 120))
      .mockResolvedValueOnce(json(200, {}))
    const client = new CdekClient({
      baseUrl: 'https://x/v2',
      clientId: 'a',
      clientSecret: 'b',
      fetch: fetchMock,
      now: () => now,
    })
    await client.get('/a')
    now = 61_000 // до истечения меньше минуты
    await client.get('/b')
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe('Bearer t2')
  })

  it('параллельные запросы делят один запрос токена', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/oauth/token') ? token() : json(200, {}),
    )
    const client = new CdekClient({
      baseUrl: 'https://x/v2',
      clientId: 'a',
      clientSecret: 'b',
      fetch: fetchMock,
    })
    await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')])
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/oauth/token'))).toHaveLength(1)
  })
})

describe('CdekClient — ошибки', () => {
  it('превращает errors[] СДЭК в CdekError с кодом и статусом', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        json(400, { errors: [{ code: 'v2_bad_request', message: 'нет веса' }] }),
      )
    const client = new CdekClient({
      baseUrl: 'https://x/v2',
      clientId: 'a',
      clientSecret: 'b',
      fetch: fetchMock,
    })
    const err = await client.post('/calculator/tariff', {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CdekError)
    expect(err).toMatchObject({ status: 400, code: 'v2_bad_request', message: 'нет веса' })
  })

  it('отказ в токене — CdekError, а не молчаливый запрос без авторизации', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(401, { error: 'invalid_client' }))
    const client = new CdekClient({
      baseUrl: 'https://x/v2',
      clientId: 'a',
      clientSecret: 'b',
      fetch: fetchMock,
    })
    await expect(client.get('/a')).rejects.toBeInstanceOf(CdekError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('CdekClient.fromEnv', () => {
  it('без ключей работает с тестовой средой и публичной учёткой из документации', () => {
    const client = CdekClient.fromEnv({})
    expect(client.baseUrl).toBe('https://api.edu.cdek.ru/v2')
    expect(client.clientId).toBe(PUBLIC_TEST_CREDENTIALS.clientId)
  })

  it('с ключами по умолчанию идёт в боевую среду', () => {
    const client = CdekClient.fromEnv({ CDEK_CLIENT_ID: 'real', CDEK_CLIENT_SECRET: 's' })
    expect(client.baseUrl).toBe('https://api.cdek.ru/v2')
  })

  it('отказывается от боевой среды без ключей', () => {
    expect(() => CdekClient.fromEnv({ CDEK_API_URL: 'https://api.cdek.ru/v2' })).toThrow(
      /CDEK_CLIENT_ID/,
    )
  })
})
