import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { SignJWT, generateKeyPair, type JWTVerifyGetKey } from 'jose'
import { yandexPayConfigFrom } from './config.js'
import { verifyYandexWebhook } from './webhook.js'

const MERCHANT = '00000000-aaaa-bbbb-cccc-000000000001'

// CryptoKey нет в глобальных типах api (без DOM) — берём тип у самого jose.
type Key = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']
let privateKey: Key
let publicKey: Key
let otherKey: Key

beforeAll(async () => {
  const a = await generateKeyPair('ES256')
  privateKey = a.privateKey
  publicKey = a.publicKey
  otherKey = (await generateKeyPair('ES256')).privateKey
})

const config = (merchantId = MERCHANT) =>
  yandexPayConfigFrom({ yandexPayEnabled: true, yandexPayMode: 'production' }, {
    YANDEX_PAY_MERCHANT_ID: merchantId,
    YANDEX_PAY_API_KEY: 'k',
  } as unknown as NodeJS.ProcessEnv)

const verify = (raw: Buffer | undefined, keys: JWTVerifyGetKey = async () => publicKey) =>
  verifyYandexWebhook(raw, { config: config(), keys })

async function sign(
  payload: Record<string, unknown>,
  opts: { key?: Key; header?: Record<string, unknown>; exp?: number | string | null } = {},
): Promise<Buffer> {
  let jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: 'test', ...(opts.header ?? {}) })
    .setIssuedAt()
  if (opts.exp !== null) jwt = jwt.setExpirationTime(opts.exp ?? '5m')
  return Buffer.from(await jwt.sign(opts.key ?? privateKey))
}

const orderEvent = (paymentStatus: string, extra: Record<string, unknown> = {}) => ({
  event: 'ORDER_STATUS_UPDATED',
  eventTime: '2026-10-24T12:00:00+00:00',
  merchantId: MERCHANT,
  order: { orderId: 'XM-2026-00042', paymentStatus },
  ...extra,
})

const now = () => Math.floor(Date.now() / 1000)

describe('verifyYandexWebhook', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('валидный CAPTURED → paid с номером заказа; FAILED, VOIDED, PENDING', async () => {
    expect(await verify(await sign(orderEvent('CAPTURED')))).toEqual({
      ok: true,
      orderNumber: 'XM-2026-00042',
      status: 'paid',
    })
    expect(await verify(await sign(orderEvent('CONFIRMED')))).toMatchObject({ status: 'paid' })
    expect(await verify(await sign(orderEvent('FAILED')))).toMatchObject({ status: 'failed' })
    expect(await verify(await sign(orderEvent('VOIDED')))).toMatchObject({ status: 'failed' })
    expect(await verify(await sign(orderEvent('PENDING')))).toMatchObject({ status: 'pending' })
  })

  it('OPERATION_STATUS_UPDATED проверяется, но заказ не меняет', async () => {
    const raw = await sign({
      event: 'OPERATION_STATUS_UPDATED',
      merchantId: MERCHANT,
      operation: {
        operationId: 'op1',
        orderId: 'XM-2026-00042',
        status: 'SUCCESS',
        operationType: 'REFUND',
      },
    })
    expect(await verify(raw)).toEqual({ ok: true, orderNumber: 'XM-2026-00042', status: 'pending' })
  })

  it('чужой merchantId → OTHER', async () => {
    const raw = await sign(orderEvent('CAPTURED', { merchantId: 'someone-else' }))
    expect(await verify(raw)).toMatchObject({ ok: false, reasonCode: 'OTHER' })
  })

  it('чужой ключ и подменённая подпись → UNAUTHORIZED', async () => {
    expect(await verify(await sign(orderEvent('CAPTURED'), { key: otherKey }))).toMatchObject({
      ok: false,
      reasonCode: 'UNAUTHORIZED',
    })
    const s = (await sign(orderEvent('CAPTURED'))).toString()
    const tampered = Buffer.from(`${s.slice(0, -4)}${s.endsWith('AAAA') ? 'BBBB' : 'AAAA'}`)
    expect(await verify(tampered)).toMatchObject({ ok: false, reasonCode: 'UNAUTHORIZED' })
  })

  it('просрочен (exp в нагрузке или в заголовке, как в примере Яндекса) → TOKEN_EXPIRED', async () => {
    expect(await verify(await sign(orderEvent('CAPTURED'), { exp: now() - 600 }))).toMatchObject({
      ok: false,
      reasonCode: 'TOKEN_EXPIRED',
    })
    const inHeader = await sign(orderEvent('CAPTURED'), { exp: null, header: { exp: now() - 600 } })
    expect(await verify(inHeader)).toMatchObject({ ok: false, reasonCode: 'TOKEN_EXPIRED' })
  })

  it('срок только в заголовке принимается; без срока и с iat из будущего — OTHER', async () => {
    expect(
      await verify(await sign(orderEvent('CAPTURED'), { exp: null, header: { exp: now() + 300 } })),
    ).toMatchObject({
      ok: true,
    })
    expect(await verify(await sign(orderEvent('CAPTURED'), { exp: null }))).toMatchObject({
      ok: false,
      reasonCode: 'OTHER',
    })
    expect(
      await verify(await sign(orderEvent('CAPTURED'), { header: { iat: now() + 3600 } })),
    ).toMatchObject({
      ok: false,
      reasonCode: 'OTHER',
    })
  })

  it('alg none и ES384 → UNAUTHORIZED', async () => {
    const none = Buffer.from(
      `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(orderEvent('CAPTURED'))).toString('base64url')}.`,
    )
    expect(await verify(none)).toMatchObject({ ok: false, reasonCode: 'UNAUTHORIZED' })
    const es384 = await generateKeyPair('ES384')
    const jwt = await new SignJWT(orderEvent('CAPTURED'))
      .setProtectedHeader({ alg: 'ES384', typ: 'JWT', kid: 'test' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(es384.privateKey)
    expect(await verify(Buffer.from(jwt), async () => es384.publicKey)).toMatchObject({
      ok: false,
      reasonCode: 'UNAUTHORIZED',
    })
  })

  it('без конфигурации (нет Merchant ID), пустое тело и не-JWT → UNAUTHORIZED без исключений', async () => {
    const raw = await sign(orderEvent('CAPTURED'))
    expect(
      await verifyYandexWebhook(raw, { config: null, keys: async () => publicKey }),
    ).toMatchObject({
      ok: false,
      reasonCode: 'UNAUTHORIZED',
    })
    expect(await verify(Buffer.alloc(0))).toMatchObject({ ok: false, reasonCode: 'UNAUTHORIZED' })
    expect(await verify(undefined)).toMatchObject({ ok: false, reasonCode: 'UNAUTHORIZED' })
    expect(await verify(Buffer.from('not a jwt'))).toMatchObject({
      ok: false,
      reasonCode: 'UNAUTHORIZED',
    })
  })

  it('лог отказа — одна строка с именем и кодом ошибки jose, без токена', async () => {
    const spy = vi.mocked(console.error)
    const raw = await sign(orderEvent('CAPTURED'), { key: otherKey })
    await verify(raw)
    expect(spy).toHaveBeenCalledTimes(1)
    const line = String(spy.mock.calls[0]?.[0])
    expect(line).toContain('ERR_JWS_SIGNATURE_VERIFICATION_FAILED')
    expect(line).not.toContain(raw.toString().split('.')[1]!)
  })
})
