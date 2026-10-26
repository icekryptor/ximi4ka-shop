import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/lib/webVitals', () => ({
  startWebVitals: vi.fn(() => Promise.resolve()),
  notePage: vi.fn(),
}))
let pathname = '/catalog'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

import { notePage, startWebVitals } from '@/lib/webVitals'
import { WebVitalsReporter } from './WebVitalsReporter'

describe('<WebVitalsReporter>', () => {
  beforeEach(() => {
    vi.mocked(startWebVitals).mockClear()
    vi.mocked(notePage).mockClear()
    pathname = '/catalog'
  })

  it('ничего не рисует и на сервере web-vitals не трогает', () => {
    expect(renderToStaticMarkup(<WebVitalsReporter />)).toBe('')
    expect(startWebVitals).not.toHaveBeenCalled()
  })

  it('запускает сбор Web Vitals после гидратации', () => {
    const { container } = render(<WebVitalsReporter />)
    expect(container).toBeEmptyDOMElement()
    expect(startWebVitals).toHaveBeenCalledTimes(1)
  })

  it('отмечает каждую смену страницы — для INP после переходов внутри сайта', () => {
    const { rerender } = render(<WebVitalsReporter />)
    expect(notePage).toHaveBeenLastCalledWith('/catalog')
    pathname = '/product/kit'
    rerender(<WebVitalsReporter />)
    expect(notePage).toHaveBeenLastCalledWith('/product/kit')
    expect(startWebVitals).toHaveBeenCalledTimes(1)
  })
})
