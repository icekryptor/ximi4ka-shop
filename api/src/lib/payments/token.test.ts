import { describe, it, expect } from 'vitest'
import { buildTokenString, generateToken, verifyToken } from './token.js'

// Official worked example from the Т-Касса docs
// (developer.tbank.ru → Прием платежей → Токен): Init request with
// TerminalKey=MerchantTerminalKey, Amount=19200, OrderId=00000,
// Description="Подарочная карта на 1000 рублей", Password=11111111111111.
const OFFICIAL_PARAMS = {
  TerminalKey: 'MerchantTerminalKey',
  Amount: '19200',
  OrderId: '00000',
  Description: 'Подарочная карта на 1000 рублей',
}
const OFFICIAL_PASSWORD = '11111111111111'
const OFFICIAL_TOKEN =
  '72dd466f8ace0a37a1f740ce5fb78101712bc0665d91a8108c7c8a0ccd426db2'

describe('buildTokenString', () => {
  it('sorts by key and concatenates values with Password included', () => {
    expect(buildTokenString(OFFICIAL_PARAMS, OFFICIAL_PASSWORD)).toBe(
      '19200Подарочная карта на 1000 рублей0000011111111111111MerchantTerminalKey',
    )
  })

  it('excludes nested objects and arrays (Receipt, DATA)', () => {
    const withNested = {
      ...OFFICIAL_PARAMS,
      DATA: { Email: 'user@example.com', Phone: '+79001234567' },
      Receipt: { Items: [{ Name: 'x', Amount: 19200 }] },
    }
    expect(buildTokenString(withNested, OFFICIAL_PASSWORD)).toBe(
      buildTokenString(OFFICIAL_PARAMS, OFFICIAL_PASSWORD),
    )
  })

  it('excludes the Token key itself and null/undefined values', () => {
    const withToken = {
      ...OFFICIAL_PARAMS,
      Token: 'deadbeef',
      RebillId: null,
      CardId: undefined,
    }
    expect(buildTokenString(withToken, OFFICIAL_PASSWORD)).toBe(
      buildTokenString(OFFICIAL_PARAMS, OFFICIAL_PASSWORD),
    )
  })

  it('serializes booleans lowercase and numbers in decimal', () => {
    expect(buildTokenString({ Success: true, Amount: 1111 }, 'pw')).toBe(
      '1111pwtrue',
    )
    // Sorted keys: Password < Success → values "pw" + "false".
    expect(buildTokenString({ Success: false }, 'pw')).toBe('pwfalse')
  })
})

describe('generateToken', () => {
  it('matches the official docs example (SHA-256 over UTF-8)', () => {
    expect(generateToken(OFFICIAL_PARAMS, OFFICIAL_PASSWORD)).toBe(
      OFFICIAL_TOKEN,
    )
  })
})

describe('verifyToken', () => {
  it('accepts a token generated with the same password', () => {
    expect(
      verifyToken(OFFICIAL_PARAMS, OFFICIAL_PASSWORD, OFFICIAL_TOKEN),
    ).toBe(true)
  })

  it('accepts uppercase hex', () => {
    expect(
      verifyToken(
        OFFICIAL_PARAMS,
        OFFICIAL_PASSWORD,
        OFFICIAL_TOKEN.toUpperCase(),
      ),
    ).toBe(true)
  })

  it('rejects a tampered payload', () => {
    expect(
      verifyToken(
        { ...OFFICIAL_PARAMS, Amount: '99999' },
        OFFICIAL_PASSWORD,
        OFFICIAL_TOKEN,
      ),
    ).toBe(false)
  })

  it('rejects a wrong password', () => {
    expect(verifyToken(OFFICIAL_PARAMS, 'wrong', OFFICIAL_TOKEN)).toBe(false)
  })

  it('rejects a token of wrong length', () => {
    expect(verifyToken(OFFICIAL_PARAMS, OFFICIAL_PASSWORD, 'abc')).toBe(false)
  })
})
