import { describe, it, expect } from 'vitest'
import { describeNetworkError, isNetworkError } from './transport.js'

describe('telegram transport', () => {
  it('describeNetworkError достаёт код из cause', () => {
    const e = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'UND_ERR_CONNECT_TIMEOUT' },
    })
    expect(describeNetworkError(e)).toBe('fetch failed (UND_ERR_CONNECT_TIMEOUT)')
    expect(describeNetworkError(new Error('boom'))).toBe('boom')
  })

  it('isNetworkError: TypeError fetch и TimeoutError — да, прочее — нет', () => {
    expect(isNetworkError(new TypeError('fetch failed'))).toBe(true)
    expect(isNetworkError(new DOMException('x', 'TimeoutError'))).toBe(true)
    expect(isNetworkError(new Error('Telegram 400'))).toBe(false)
  })
})
