import { describe, it, expect, beforeEach } from 'vitest'
import {
  SIGNED_IN_SCRIPT,
  expireSignedInCookie,
  hasSignedInCookie,
  setSignedInAttr,
} from './signedInHint'

function clearCookies() {
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
  delete document.documentElement.dataset.signedIn
}

describe('signedInHint', () => {
  beforeEach(clearCookies)

  it('hasSignedInCookie видит читаемую CSRF-cookie', () => {
    expect(hasSignedInCookie()).toBe(false)
    document.cookie = 'ximi4ka_customer_csrf=abc; path=/'
    expect(hasSignedInCookie()).toBe(true)
  })

  it('не путает с другой cookie похожего имени', () => {
    document.cookie = 'x_ximi4ka_customer_csrf=abc; path=/'
    expect(hasSignedInCookie()).toBe(false)
  })

  it('setSignedInAttr ставит и снимает атрибут', () => {
    setSignedInAttr(true)
    expect(document.documentElement.dataset.signedIn).toBe('1')
    setSignedInAttr(false)
    expect(document.documentElement.dataset.signedIn).toBeUndefined()
  })

  it('expireSignedInCookie снимает cookie', () => {
    document.cookie = 'ximi4ka_customer_csrf=abc; path=/'
    expect(hasSignedInCookie()).toBe(true)
    expireSignedInCookie()
    expect(hasSignedInCookie()).toBe(false)
  })

  it('инлайн-скрипт без cookie ничего не ставит', () => {
    new Function(SIGNED_IN_SCRIPT)()
    expect(document.documentElement.dataset.signedIn).toBeUndefined()
  })

  it('инлайн-скрипт с cookie ставит data-signed-in', () => {
    document.cookie = 'ximi4ka_customer_csrf=abc; path=/'
    new Function(SIGNED_IN_SCRIPT)()
    expect(document.documentElement.dataset.signedIn).toBe('1')
  })

  it('инлайн-скрипт не бросает при недоступном document.cookie', () => {
    const spy = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get() {
        throw new Error('blocked')
      },
    })
    try {
      expect(() => new Function(SIGNED_IN_SCRIPT)()).not.toThrow()
    } finally {
      delete (document as unknown as Record<string, unknown>).cookie
      Object.defineProperty(Document.prototype, 'cookie', spy)
    }
  })
})
