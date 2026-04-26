import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MobileBuyBar } from './MobileBuyBar'
import type { Product } from '@ximi4ka-shop/shared'

const fixture = (overrides: Partial<Product> = {}): Product => ({
  id: '1',
  slug: 'test-kit',
  sku: null,
  name: 'Test Kit',
  shortDescription: null,
  longDescriptionBlocks: [],
  priceRub: 2490,
  compareAtPriceRub: null,
  stockStatus: 'in_stock',
  isPublished: true,
  sortOrder: 0,
  metaTitle: null,
  metaDescription: null,
  ogImage: null,
  canonicalUrl: null,
  noindex: false,
  translations: {},
  images: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('MobileBuyBar', () => {
  beforeEach(() => {
    // Provide an IntersectionObserver mock that immediately reports the
    // sentinel as NOT intersecting (i.e. user has scrolled past it).
    class MockIO {
      callback: IntersectionObserverCallback
      constructor(cb: IntersectionObserverCallback) {
        this.callback = cb
      }
      observe(target: Element) {
        // Synchronously fire one entry: not intersecting → bar should show.
        this.callback(
          [
            {
              isIntersecting: false,
              target,
              boundingClientRect: {} as DOMRectReadOnly,
              intersectionRatio: 0,
              intersectionRect: {} as DOMRectReadOnly,
              rootBounds: null,
              time: 0,
            },
          ],
          this as unknown as IntersectionObserver,
        )
      }
      unobserve() {}
      disconnect() {}
      takeRecords(): IntersectionObserverEntry[] {
        return []
      }
    }
    vi.stubGlobal('IntersectionObserver', MockIO)
  })

  it('renders product name and price when sentinel out of view', () => {
    const sentinel = document.createElement('div')
    document.body.appendChild(sentinel)
    render(<MobileBuyBar product={fixture()} sentinelRef={{ current: sentinel }} />)
    expect(screen.getByText('Test Kit')).toBeInTheDocument()
    expect(screen.getByText(/2.490.*₽/)).toBeInTheDocument()
    document.body.removeChild(sentinel)
  })

  it('renders «В корзину» button when in_stock', () => {
    const sentinel = document.createElement('div')
    document.body.appendChild(sentinel)
    render(<MobileBuyBar product={fixture({ stockStatus: 'in_stock' })} sentinelRef={{ current: sentinel }} />)
    expect(screen.getByRole('button', { name: 'В корзину' })).toBeInTheDocument()
    document.body.removeChild(sentinel)
  })

  it('disables button + shows «Нет в наличии» when out_of_stock', () => {
    const sentinel = document.createElement('div')
    document.body.appendChild(sentinel)
    render(<MobileBuyBar product={fixture({ stockStatus: 'out_of_stock' })} sentinelRef={{ current: sentinel }} />)
    const btn = screen.getByRole('button', { name: 'Нет в наличии' })
    expect(btn).toBeDisabled()
    document.body.removeChild(sentinel)
  })

  it('renders nothing when sentinelRef is null', () => {
    const { container } = render(<MobileBuyBar product={fixture()} sentinelRef={{ current: null }} />)
    expect(container.firstChild).toBeNull()
  })
})
