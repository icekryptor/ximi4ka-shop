import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEvent, resetTrackerForTests, trackEvent } from './track'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

beforeEach(() => {
  window.localStorage.clear()
  resetTrackerForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true })
})

describe('buildEvent', () => {
  it('отбрасывает цели не из белого списка (purchase)', () => {
    expect(buildEvent('purchase')).toBeNull()
    expect(buildEvent('whatever')).toBeNull()
  })

  it('собирает тело: тип, visitorId, путь, meta', () => {
    const event = buildEvent('add_to_cart', { product_id: 'p1', quantity: 2 })
    expect(event).toMatchObject({
      type: 'add_to_cart',
      path: window.location.pathname,
      meta: { product_id: 'p1', quantity: 2 },
    })
    expect(event?.visitorId).toMatch(UUID_RE)
  })

  it('без meta поле не добавляется', () => {
    expect(buildEvent('open_cart')).not.toHaveProperty('meta')
  })

  it('visitorId стабилен между событиями и лежит в localStorage', () => {
    const a = buildEvent('open_cart')
    const b = buildEvent('open_cart')
    expect(a?.visitorId).toBe(b?.visitorId)
    expect(window.localStorage.getItem('ximi4ka-visitor-id')).toBe(a?.visitorId)
  })

  it('подхватывает сохранённый visitorId после перезагрузки страницы', () => {
    const stored = '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b'
    window.localStorage.setItem('ximi4ka-visitor-id', stored)
    expect(buildEvent('open_cart')?.visitorId).toBe(stored)
  })

  it('мусор в localStorage заменяется новым uuid', () => {
    window.localStorage.setItem('ximi4ka-visitor-id', 'not-a-uuid')
    expect(buildEvent('open_cart')?.visitorId).toMatch(UUID_RE)
  })

  it('недоступный localStorage: id всё равно стабилен в рамках страницы', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const a = buildEvent('open_cart')
    const b = buildEvent('open_cart')
    expect(a?.visitorId).toMatch(UUID_RE)
    expect(a?.visitorId).toBe(b?.visitorId)
  })
})

describe('trackEvent', () => {
  it('шлёт через sendBeacon JSON-Blob на /api/public/events', () => {
    const beacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    trackEvent('add_to_cart', { quantity: 1 })

    expect(beacon).toHaveBeenCalledTimes(1)
    const [url, body] = beacon.mock.calls[0] as unknown as [string, Blob]
    expect(url).toMatch(/\/api\/public\/events$/)
    expect(body).toBeInstanceOf(Blob)
    expect(body.type).toBe('application/json')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('без sendBeacon падает на fetch с keepalive', () => {
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true })
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
    vi.stubGlobal('fetch', fetchMock)

    trackEvent('open_cart')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/public\/events$/)
    expect(init).toMatchObject({ method: 'POST', keepalive: true })
  })

  it('sendBeacon вернул false (очередь полна) — тоже fetch', () => {
    Object.defineProperty(navigator, 'sendBeacon', { value: () => false, configurable: true })
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
    vi.stubGlobal('fetch', fetchMock)

    trackEvent('begin_checkout')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('не-целевое событие ничего не отправляет', () => {
    const beacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    trackEvent('purchase')

    expect(beacon).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('сетевая ошибка fetch и исключение sendBeacon не пробрасываются', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    expect(() => trackEvent('open_cart')).not.toThrow()
    await Promise.resolve()

    Object.defineProperty(navigator, 'sendBeacon', {
      value: () => {
        throw new Error('boom')
      },
      configurable: true,
    })
    expect(() => trackEvent('open_cart')).not.toThrow()
  })

  it('нет ни sendBeacon, ни fetch — не бросает', () => {
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true })
    vi.stubGlobal('fetch', undefined)
    expect(() => trackEvent('open_cart')).not.toThrow()
  })
})
