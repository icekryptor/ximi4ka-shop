import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/lib/webVitals', () => ({ startWebVitals: vi.fn(() => Promise.resolve()) }))

import { startWebVitals } from '@/lib/webVitals'
import { WebVitalsReporter } from './WebVitalsReporter'

describe('<WebVitalsReporter>', () => {
  beforeEach(() => vi.mocked(startWebVitals).mockClear())

  it('ничего не рисует и на сервере web-vitals не трогает', () => {
    expect(renderToStaticMarkup(<WebVitalsReporter />)).toBe('')
    expect(startWebVitals).not.toHaveBeenCalled()
  })

  it('запускает сбор Web Vitals после гидратации', () => {
    const { container } = render(<WebVitalsReporter />)
    expect(container).toBeEmptyDOMElement()
    expect(startWebVitals).toHaveBeenCalledTimes(1)
  })
})
