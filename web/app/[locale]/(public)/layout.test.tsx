import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/Header', () => ({ Header: () => <i data-header /> }))
vi.mock('@/components/Footer', () => ({ Footer: () => <i data-footer /> }))
vi.mock('@/components/CartDrawer', () => ({ CartDrawer: () => <i data-cart-drawer /> }))
vi.mock('@/components/AttributionTracker', () => ({
  AttributionTracker: () => <i data-attribution />,
}))
vi.mock('@/components/WebVitalsReporter', () => ({
  WebVitalsReporter: () => <i data-web-vitals />,
}))
vi.mock('@/lib/api', () => ({ getPublicSettings: vi.fn(() => Promise.reject(new Error('down'))) }))

import PublicLayout from './layout'

describe('PublicLayout', () => {
  it('собирает полевые Web Vitals на всех страницах витрины', async () => {
    const html = renderToStaticMarkup(await PublicLayout({ children: <p>страница</p> }))
    expect(html).toContain('data-web-vitals')
    expect(html).toContain('страница')
  })
})
