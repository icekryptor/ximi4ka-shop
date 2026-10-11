import { describe, it, expect, vi } from 'vitest'
import { RateLimitError } from '../notifications/rateLimit.js'
import { MetrikaClient, MetrikaError, buildCsv } from './client.js'

const SECRET = 'y0_FAKE_SECRET_TOKEN'
const T = new Date('2026-10-05T12:30:00.000Z')
const T_UNIX = Math.floor(T.getTime() / 1000)

function ok(uploading: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      uploading: { id: 42, source_quantity: 1, line_quantity: 1, status: 'PREPARED', ...uploading },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

async function sentCsv(init: RequestInit): Promise<string> {
  const file = (init.body as FormData).get('file') as Blob
  return file.text()
}

describe('buildCsv', () => {
  it('шапка Yclid,Target,DateTime,Price,Currency и строка с Unix-временем в секундах', () => {
    const csv = buildCsv([{ yclid: '123', target: 'order_paid', eventAt: T, priceRub: 1500 }])

    expect(csv).toBe(
      `Yclid,Target,DateTime,Price,Currency\r\n123,order_paid,${T_UNIX},1500,RUB\r\n`,
    )
  })

  it('несколько строк, разделитель строк CRLF (RFC 4180)', () => {
    const csv = buildCsv([
      { yclid: '1', target: 't', eventAt: T, priceRub: 100 },
      { yclid: '2', target: 't', eventAt: T, priceRub: 200 },
    ])

    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(3)
  })

  it('значения с запятой и кавычкой экранируются, чужая запятая не сдвигает колонки', () => {
    const csv = buildCsv([{ yclid: 'a,"b', target: 't', eventAt: T, priceRub: 1 }])

    expect(csv.split('\r\n')[1]).toBe(`"a,""b",t,${T_UNIX},1,RUB`)
  })
})

describe('MetrikaClient.uploadConversions', () => {
  it('POST multipart с полем file, заголовок OAuth, адрес счётчика', async () => {
    const fetchMock = vi.fn(async () => ok())
    const client = new MetrikaClient({ token: SECRET, fetch: fetchMock })

    await client.uploadConversions('113445304', [
      { yclid: '123', target: 'order_paid', eventAt: T, priceRub: 1500 },
    ])

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api-metrika.yandex.net/management/v1/counter/113445304/offline_conversions/upload',
    )
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(`OAuth ${SECRET}`)
    expect(await sentCsv(init)).toContain(`123,order_paid,${T_UNIX},1500,RUB`)
  })

  it('возвращает id загрузки и счётчики строк', async () => {
    const client = new MetrikaClient({
      token: SECRET,
      fetch: async () => ok({ id: 777, source_quantity: 3, line_quantity: 2, status: 'UPLOADED' }),
    })

    const result = await client.uploadConversions('1', [
      { yclid: '1', target: 't', eventAt: T, priceRub: 1 },
    ])

    expect(result).toEqual({
      uploadId: 777,
      sourceQuantity: 3,
      lineQuantity: 2,
      status: 'UPLOADED',
    })
  })

  it('ошибка HTTP: MetrikaError со статусом и текстом, без токена в сообщении', async () => {
    const client = new MetrikaClient({
      token: SECRET,
      fetch: async () => new Response('{"errors":[{"message":"Access denied"}]}', { status: 403 }),
    })

    const err = await client
      .uploadConversions('1', [{ yclid: '1', target: 't', eventAt: T, priceRub: 1 }])
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(MetrikaError)
    expect((err as MetrikaError).status).toBe(403)
    expect((err as MetrikaError).message).toContain('Access denied')
    expect((err as MetrikaError).message).not.toContain(SECRET)
  })

  it('429: RateLimitError с паузой из Retry-After', async () => {
    const client = new MetrikaClient({
      token: SECRET,
      fetch: async () =>
        new Response('slow down', { status: 429, headers: { 'retry-after': '120' } }),
    })

    const err = await client
      .uploadConversions('1', [{ yclid: '1', target: 't', eventAt: T, priceRub: 1 }])
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(RateLimitError)
    expect((err as RateLimitError).retryAfterMs).toBe(120_000)
  })

  it('429 с Retry-After в формате даты: пауза до этой даты', async () => {
    const at = new Date(Date.now() + 90_000).toUTCString()
    const client = new MetrikaClient({
      token: SECRET,
      fetch: async () => new Response('slow', { status: 429, headers: { 'retry-after': at } }),
    })

    const err = (await client
      .uploadConversions('1', [{ yclid: '1', target: 't', eventAt: T, priceRub: 1 }])
      .catch((e: unknown) => e)) as RateLimitError

    expect(err.retryAfterMs).toBeGreaterThan(60_000)
    expect(err.retryAfterMs).toBeLessThanOrEqual(90_000)
  })

  it('ответ без uploading — ошибка, а не тихий успех', async () => {
    const client = new MetrikaClient({
      token: SECRET,
      fetch: async () => new Response('{}', { status: 200 }),
    })

    await expect(
      client.uploadConversions('1', [{ yclid: '1', target: 't', eventAt: T, priceRub: 1 }]),
    ).rejects.toBeInstanceOf(MetrikaError)
  })

  it('сетевой сбой пробрасывается как есть (воркер повторит)', async () => {
    const client = new MetrikaClient({
      token: SECRET,
      fetch: async () => {
        throw new Error('socket hang up')
      },
    })

    await expect(
      client.uploadConversions('1', [{ yclid: '1', target: 't', eventAt: T, priceRub: 1 }]),
    ).rejects.toThrow('socket hang up')
  })
})

describe('MetrikaClient.fromEnv', () => {
  it('без токена — null', () => {
    expect(MetrikaClient.fromEnv({})).toBeNull()
    expect(MetrikaClient.fromEnv({ METRIKA_OAUTH_TOKEN: '  ' })).toBeNull()
  })

  it('с токеном — клиент', () => {
    expect(MetrikaClient.fromEnv({ METRIKA_OAUTH_TOKEN: SECRET })).toBeInstanceOf(MetrikaClient)
  })
})
