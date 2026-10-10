import { describe, it, expect, beforeEach } from 'vitest'
import {
  ATTRIBUTION_STORAGE_KEY,
  ATTRIBUTION_TTL_MS,
  loadAttribution,
  readTouch,
  recordVisit,
} from './attribution'

const DAY = 24 * 60 * 60 * 1000
const T0 = new Date('2026-10-01T10:00:00.000Z')

function visit(href: string, referrer = '', now = T0) {
  return { href, referrer, ownHost: 'new.ximi4ka.ru', now }
}

describe('readTouch', () => {
  it('читает yclid и utm_* из адреса, страница входа — путь без параметров', () => {
    const { touch, tagged } = readTouch(
      visit(
        'https://new.ximi4ka.ru/product/kit?yclid=123&utm_source=yandex&utm_medium=cpc&utm_campaign=c1&utm_term=%D1%85%D0%B8%D0%BC%D0%B8%D1%8F&utm_content=a1&q=secret',
      ),
    )

    expect(tagged).toBe(true)
    expect(touch).toEqual({
      at: T0.toISOString(),
      landing: '/product/kit',
      yclid: '123',
      utm_source: 'yandex',
      utm_medium: 'cpc',
      utm_campaign: 'c1',
      utm_term: 'химия',
      utm_content: 'a1',
    })
  })

  it('ysclid — метка органического перехода из Яндекса, тоже размеченное касание', () => {
    const { touch, tagged } = readTouch(visit('https://new.ximi4ka.ru/?ysclid=lx1'))

    expect(tagged).toBe(true)
    expect(touch.ysclid).toBe('lx1')
  })

  it('внешний referrer сохраняется без параметров, но касание не размечено', () => {
    const { touch, tagged } = readTouch(
      visit(
        'https://new.ximi4ka.ru/',
        'https://yandex.ru/search/?text=%D0%BD%D0%B0%D0%B1%D0%BE%D1%80',
      ),
    )

    expect(tagged).toBe(false)
    expect(touch.referrer).toBe('https://yandex.ru/search/')
  })

  it.each([
    'https://new.ximi4ka.ru/catalog?x=1',
    'https://ximi4ka.ru/',
    'https://www.ximi4ka.ru/blog',
  ])('свой сайт (%s) в referrer не пишем', (referrer) => {
    const { touch } = readTouch(visit('https://new.ximi4ka.ru/', referrer))

    expect(touch).not.toHaveProperty('referrer')
  })

  it('прямой заход: только страница входа', () => {
    const { touch, tagged } = readTouch(visit('https://new.ximi4ka.ru/catalog'))

    expect(tagged).toBe(false)
    expect(touch).toEqual({ at: T0.toISOString(), landing: '/catalog' })
  })

  it('пустые и пробельные метки пропускает, слишком длинные режет', () => {
    const long = 'x'.repeat(500)
    const { touch, tagged } = readTouch(
      visit(`https://new.ximi4ka.ru/?utm_source=%20&utm_medium=${long}`),
    )

    expect(tagged).toBe(true)
    expect(touch).not.toHaveProperty('utm_source')
    expect(touch.utm_medium).toHaveLength(200)
  })

  it('нулевой и прочие управляющие символы в метках вырезаются', () => {
    const { touch } = readTouch(
      visit('https://new.ximi4ka.ru/?utm_source=a%00b&utm_term=%0A%09x%7F'),
    )

    expect(touch.utm_source).toBe('ab')
    expect(touch.utm_term).toBe('x')
  })

  it('обрезка не разрезает эмодзи пополам', () => {
    const { touch } = readTouch(
      visit(`https://new.ximi4ka.ru/?utm_campaign=${'x'.repeat(199)}%F0%9F%98%80%F0%9F%98%80`),
    )

    expect(touch.utm_campaign).toBe('x'.repeat(199) + '😀')
  })

  it('битый адрес и битый referrer не роняют разбор', () => {
    const { touch } = readTouch(visit('не адрес', 'тоже не адрес'))

    expect(touch.landing).toBe('/')
    expect(touch).not.toHaveProperty('referrer')
  })
})

describe('recordVisit / loadAttribution', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('пока ничего не записано — атрибуции нет', () => {
    expect(loadAttribution(window.localStorage, T0)).toBeUndefined()
  })

  it('первый заход, даже прямой, становится первым касанием', () => {
    recordVisit(window.localStorage, visit('https://new.ximi4ka.ru/catalog'))

    expect(loadAttribution(window.localStorage, T0)).toEqual({
      first: { at: T0.toISOString(), landing: '/catalog' },
    })
  })

  it('первое касание не перезаписывается, последнее — только размеченным заходом', () => {
    recordVisit(window.localStorage, visit('https://new.ximi4ka.ru/a', 'https://yandex.ru/'))
    const t1 = new Date(T0.getTime() + DAY)
    recordVisit(
      window.localStorage,
      visit('https://new.ximi4ka.ru/b?yclid=1&utm_source=yandex', '', t1),
    )
    const t2 = new Date(T0.getTime() + 2 * DAY)
    recordVisit(window.localStorage, visit('https://new.ximi4ka.ru/c', 'https://vk.com/', t2))

    const result = loadAttribution(window.localStorage, t2)
    expect(result?.first).toMatchObject({ landing: '/a', referrer: 'https://yandex.ru/' })
    expect(result?.last).toMatchObject({ landing: '/b', yclid: '1', utm_source: 'yandex' })
  })

  it('новый размеченный заход заменяет последнее касание', () => {
    recordVisit(window.localStorage, visit('https://new.ximi4ka.ru/?yclid=1'))
    const t1 = new Date(T0.getTime() + DAY)
    recordVisit(window.localStorage, visit('https://new.ximi4ka.ru/?yclid=2', '', t1))

    expect(loadAttribution(window.localStorage, t1)?.last?.yclid).toBe('2')
  })

  it('касания старше 30 дней не отдаются и вытесняются новым заходом', () => {
    recordVisit(window.localStorage, visit('https://new.ximi4ka.ru/old?yclid=1'))
    const later = new Date(T0.getTime() + ATTRIBUTION_TTL_MS + 1)

    expect(loadAttribution(window.localStorage, later)).toBeUndefined()

    recordVisit(window.localStorage, visit('https://new.ximi4ka.ru/new', '', later))
    expect(loadAttribution(window.localStorage, later)).toEqual({
      first: { at: later.toISOString(), landing: '/new' },
    })
  })

  it('битое содержимое хранилища игнорируется', () => {
    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, '{не json')

    expect(loadAttribution(window.localStorage, T0)).toBeUndefined()
    recordVisit(window.localStorage, visit('https://new.ximi4ka.ru/x'))
    expect(loadAttribution(window.localStorage, T0)?.first?.landing).toBe('/x')
  })

  it('хранилище недоступно (null или бросает) — молча ничего не делает', () => {
    const broken = {
      getItem() {
        throw new Error('denied')
      },
      setItem() {
        throw new Error('denied')
      },
    } as unknown as Storage

    expect(() => recordVisit(null, visit('https://new.ximi4ka.ru/'))).not.toThrow()
    expect(() => recordVisit(broken, visit('https://new.ximi4ka.ru/'))).not.toThrow()
    expect(loadAttribution(null, T0)).toBeUndefined()
    expect(loadAttribution(broken, T0)).toBeUndefined()
  })
})
