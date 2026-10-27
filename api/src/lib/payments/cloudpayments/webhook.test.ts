import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  amountKopecks,
  isTestModeNotification,
  parseCloudPaymentsBody,
  verifyCloudPaymentsSignature,
} from './webhook.js'

const SECRET = 'test-api-secret-not-real'
const sign = (data: string | Buffer, secret = SECRET) =>
  createHmac('sha256', secret).update(data).digest('base64')

const raw =
  'TransactionId=123&Amount=2916.00&InvoiceId=XM-2026-00001&Name=%D0%98%D0%B2%D0%B0%D0%BD+%D0%98'

describe('verifyCloudPaymentsSignature', () => {
  it('Content-HMAC от тела как есть — верно', () => {
    expect(
      verifyCloudPaymentsSignature(Buffer.from(raw), { 'content-hmac': sign(raw) }, SECRET),
    ).toBe(true)
  })

  it('X-Content-HMAC от раскодированного тела — верно', () => {
    const decoded = decodeURIComponent(raw.replace(/\+/g, ' '))
    expect(
      verifyCloudPaymentsSignature(Buffer.from(raw), { 'x-content-hmac': sign(decoded) }, SECRET),
    ).toBe(true)
  })

  it('изменённое тело, чужой ключ, пустой ключ, нет заголовков — неверно', () => {
    const tampered = raw.replace('2916.00', '1.00')
    expect(
      verifyCloudPaymentsSignature(Buffer.from(tampered), { 'content-hmac': sign(raw) }, SECRET),
    ).toBe(false)
    expect(
      verifyCloudPaymentsSignature(
        Buffer.from(raw),
        { 'content-hmac': sign(raw, 'other') },
        SECRET,
      ),
    ).toBe(false)
    expect(
      verifyCloudPaymentsSignature(Buffer.from(raw), { 'content-hmac': sign(raw, '') }, ''),
    ).toBe(false)
    expect(verifyCloudPaymentsSignature(Buffer.from(raw), {}, SECRET)).toBe(false)
  })

  it('при наличии Content-HMAC решает только он: неверный Content-HMAC + верный X-Content-HMAC — неверно', () => {
    const decoded = decodeURIComponent(raw.replace(/\+/g, ' '))
    expect(
      verifyCloudPaymentsSignature(
        Buffer.from(raw),
        { 'content-hmac': sign(raw, 'other'), 'x-content-hmac': sign(decoded) },
        SECRET,
      ),
    ).toBe(false)
  })

  it('подпись сырого тела только в X-Content-HMAC — неверно, если раскодированное тело другое', () => {
    expect(
      verifyCloudPaymentsSignature(Buffer.from(raw), { 'x-content-hmac': sign(raw) }, SECRET),
    ).toBe(false)
  })

  it('мусор вместо base64 и битая %-последовательность не роняют проверку', () => {
    expect(verifyCloudPaymentsSignature(Buffer.from(raw), { 'content-hmac': '###' }, SECRET)).toBe(
      false,
    )
    expect(
      verifyCloudPaymentsSignature(Buffer.from('a=%E0%A4%A'), { 'x-content-hmac': 'AAAA' }, SECRET),
    ).toBe(false)
  })
})

describe('parseCloudPaymentsBody', () => {
  it('form-urlencoded', () => {
    expect(
      parseCloudPaymentsBody(Buffer.from(raw), 'application/x-www-form-urlencoded'),
    ).toMatchObject({
      TransactionId: '123',
      Amount: '2916.00',
      Name: 'Иван И',
    })
  })

  it('JSON: числа и булевы — строками, объекты — JSON-строкой', () => {
    const body = JSON.stringify({
      TransactionId: 123,
      Amount: 2916,
      TestMode: true,
      Data: { a: 1 },
      Email: null,
    })
    expect(parseCloudPaymentsBody(Buffer.from(body), 'application/json; charset=utf-8')).toEqual({
      TransactionId: '123',
      Amount: '2916',
      TestMode: 'true',
      Data: '{"a":1}',
      Email: '',
    })
  })

  it('битый JSON и не-объект — null', () => {
    expect(parseCloudPaymentsBody(Buffer.from('{'), 'application/json')).toBeNull()
    expect(parseCloudPaymentsBody(Buffer.from('[1]'), 'application/json')).toBeNull()
  })
})

describe('amountKopecks', () => {
  it('рубли с точкой в копейки без float', () => {
    expect(amountKopecks('2916.00')).toBe(291600)
    expect(amountKopecks('2916')).toBe(291600)
    expect(amountKopecks('0.1')).toBe(10)
    expect(amountKopecks(' 19.99 ')).toBe(1999)
  })

  it('запятая, минус, три знака, пусто — null', () => {
    for (const v of ['2916,00', '-1', '1.001', '', undefined, 'abc'])
      expect(amountKopecks(v)).toBeNull()
  })
})

describe('isTestModeNotification', () => {
  it('пусто, 0, false (в любом регистре) и отсутствие поля — не тест', () => {
    for (const v of ['', '0', 'false', 'FALSE', 'False', ' 0 '])
      expect(isTestModeNotification({ TestMode: v })).toBe(false)
    expect(isTestModeNotification({})).toBe(false)
  })

  it('всё остальное — тест (fail closed)', () => {
    for (const v of ['1', 'true', 'True', 'TRUE', 'yes', '2'])
      expect(isTestModeNotification({ TestMode: v })).toBe(true)
  })
})
