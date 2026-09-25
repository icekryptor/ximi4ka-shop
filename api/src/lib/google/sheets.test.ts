import { describe, it, expect, vi } from 'vitest'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import {
  GoogleSheetsClient,
  SHEETS_SCOPE,
  SheetsConfigError,
  parseServiceAccount,
} from './sheets.js'
import { SHEET_HEADER } from '../notifications/format.js'

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})
const account = {
  client_email: 'shop@project.iam.gserviceaccount.com',
  private_key: privateKey,
  token_uri: 'https://oauth2.googleapis.com/token',
}
const BASE = 'https://sheets.googleapis.com/v4/spreadsheets/SHEET123/values/'
const range = (r: string) => encodeURIComponent(`'Заказы'!${r}`)

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
const tokenOk = () => json(200, { access_token: 'ya29.token', expires_in: 3599 })

function client(fetchMock: ReturnType<typeof vi.fn>, now = () => 1_790_000_000_000) {
  return new GoogleSheetsClient({
    serviceAccount: account,
    spreadsheetId: 'SHEET123',
    sheetName: 'Заказы',
    fetch: fetchMock,
    now,
  })
}

describe('parseServiceAccount', () => {
  it('принимает JSON как есть', () => {
    expect(parseServiceAccount(JSON.stringify(account)).client_email).toBe(account.client_email)
  })

  it('принимает base64', () => {
    const b64 = Buffer.from(JSON.stringify(account)).toString('base64')
    expect(parseServiceAccount(b64).private_key).toBe(privateKey)
  })

  it('чинит буквальные \\n в private_key', () => {
    const raw = JSON.stringify({ ...account, private_key: privateKey.replace(/\n/g, '\\n') })
    expect(parseServiceAccount(raw).private_key).toBe(privateKey)
  })

  it('без client_email или private_key — SheetsConfigError', () => {
    expect(() => parseServiceAccount('{"client_email":"x"}')).toThrow(SheetsConfigError)
    expect(() => parseServiceAccount('не json')).toThrow(SheetsConfigError)
  })
})

describe('GoogleSheetsClient', () => {
  it('подписывает JWT сервисного аккаунта RS256', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce(json(200, { values: [SHEET_HEADER.slice(0, 1)] }))
      .mockResolvedValueOnce(json(200, {}))
    await client(f).upsertOrderRow('XM-1', ['XM-1'])

    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    const form = new URLSearchParams(String(init.body))
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    const [h, p, s] = form.get('assertion')!.split('.')
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toEqual({
      iss: account.client_email,
      scope: SHEETS_SCOPE,
      aud: account.token_uri,
      iat: 1_790_000_000,
      exp: 1_790_003_600,
    })
    const verify = createVerify('RSA-SHA256')
    verify.update(`${h}.${p}`)
    expect(verify.verify(publicKey, Buffer.from(s, 'base64url'))).toBe(true)
  })

  it('на пустом листе пишет заголовки и добавляет строку', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce(json(200, {}))
      .mockResolvedValueOnce(json(200, {}))
      .mockResolvedValueOnce(json(200, {}))
    await client(f).upsertOrderRow('XM-1', ['XM-1', 'Мария'])

    expect(f.mock.calls[1][0]).toBe(`${BASE}${range('A:A')}`)
    expect(f.mock.calls[1][1].headers.Authorization).toBe('Bearer ya29.token')
    expect(f.mock.calls[2][0]).toBe(`${BASE}${range('A1:L1')}?valueInputOption=RAW`)
    expect(f.mock.calls[2][1].method).toBe('PUT')
    expect(JSON.parse(f.mock.calls[2][1].body)).toEqual({ values: [SHEET_HEADER] })
    expect(f.mock.calls[3][0]).toBe(
      `${BASE}${range('A:L')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    )
    expect(f.mock.calls[3][1].method).toBe('POST')
    expect(JSON.parse(f.mock.calls[3][1].body)).toEqual({ values: [['XM-1', 'Мария']] })
  })

  it('находит заказ в любой строке и перезаписывает её целиком', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce(
        json(200, { values: [['№ заказа'], ['XM-5'], [], ['XM-3'], ['XM-1'], ['XM-9'], ['XM-1']] }),
      )
      .mockResolvedValueOnce(json(200, {}))
    await client(f).upsertOrderRow('XM-1', ['XM-1', '=IMPORTXML("x","y")'])

    expect(f).toHaveBeenCalledTimes(3)
    expect(f.mock.calls[2][0]).toBe(`${BASE}${range('A5:L5')}?valueInputOption=RAW`)
    expect(f.mock.calls[2][1].method).toBe('PUT')
    // RAW: формула остаётся текстом.
    expect(JSON.parse(f.mock.calls[2][1].body)).toEqual({
      values: [['XM-1', '=IMPORTXML("x","y")']],
    })
  })

  it('переиспользует токен до истечения', async () => {
    const f = vi.fn(async (url: string) =>
      url.includes('oauth2') ? tokenOk() : json(200, { values: [['№ заказа'], ['XM-1']] }),
    )
    const c = client(f as unknown as ReturnType<typeof vi.fn>)
    await c.upsertOrderRow('XM-1', ['XM-1'])
    await c.upsertOrderRow('XM-1', ['XM-1'])
    expect(f.mock.calls.filter(([u]) => String(u).includes('oauth2'))).toHaveLength(1)
  })

  it('403/404/400 — ошибка настройки (SheetsConfigError)', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce(
        json(403, { error: { message: 'The caller does not have permission' } }),
      )
    const err = await client(f)
      .upsertOrderRow('XM-1', ['XM-1'])
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SheetsConfigError)
    expect((err as Error).message).toMatch(/permission/)
  })

  it('429/5xx — временная ошибка, не SheetsConfigError', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenOk())
      .mockResolvedValueOnce(json(503, { error: { message: 'backend error' } }))
    const err = await client(f)
      .upsertOrderRow('XM-1', ['XM-1'])
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(SheetsConfigError)
  })

  it('fromEnv без ключей — null', () => {
    expect(GoogleSheetsClient.fromEnv({})).toBeNull()
  })
})
