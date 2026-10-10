import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { ATTRIBUTION_STORAGE_KEY, loadAttribution } from '@/lib/attribution'
import { AttributionTracker } from './AttributionTracker'

function setReferrer(value: string) {
  Object.defineProperty(document, 'referrer', { value, configurable: true })
}

describe('<AttributionTracker>', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    window.history.pushState({}, '', '/')
    setReferrer('')
  })

  it('на загрузке страницы запоминает метки из адреса и referrer', () => {
    window.history.pushState({}, '', '/product/kit?yclid=777&utm_source=yandex&q=secret')
    setReferrer('https://yandex.ru/search/?text=abc')

    render(<AttributionTracker />)

    const saved = loadAttribution(window.localStorage, new Date())
    expect(saved?.first).toMatchObject({
      landing: '/product/kit',
      referrer: 'https://yandex.ru/search/',
      yclid: '777',
      utm_source: 'yandex',
    })
    expect(saved?.last?.yclid).toBe('777')
    expect(window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY)).not.toContain('secret')
  })

  it('прямой заход: только первое касание со страницей входа', () => {
    window.history.pushState({}, '', '/catalog')

    render(<AttributionTracker />)

    const saved = loadAttribution(window.localStorage, new Date())
    expect(saved?.first?.landing).toBe('/catalog')
    expect(saved).not.toHaveProperty('last')
  })

  it('ничего не рисует', () => {
    const { container } = render(<AttributionTracker />)

    expect(container).toBeEmptyDOMElement()
  })
})
