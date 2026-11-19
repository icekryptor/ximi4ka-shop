import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { resetAfterPaintForTests } from '@/lib/afterPaint'

// The storefront tracker POSTs to the API on every trackEvent. Tests that run
// useCart().add / CartDrawer / checkout without mocking it would fire a real
// fetch to localhost:3001 (junk rows if a developer runs the API locally), so
// trackEvent is a no-op spy by default. lib/track.test.ts opts out with
// vi.unmock to exercise the real module.
vi.mock('@/lib/track', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/track')>()),
  trackEvent: vi.fn(),
}))

// With vitest's globals: false, @testing-library/react doesn't auto-register
// its afterEach cleanup. Unmount rendered components between tests or
// getBy* queries see duplicates from the previous case.
// Очередь afterNextPaint модульная и держит порядок событий: событие,
// поставленное тестом на настоящих таймерах, иначе задержало бы следующий тест
// на поддельных.
afterEach(() => {
  cleanup()
  resetAfterPaintForTests()
})

// jsdom doesn't implement Range#getClientRects or Element#getClientRects
// fully, which breaks ProseMirror's scrollToSelection path when Tiptap is
// mounted in tests. Provide harmless stubs so the editor can scroll without
// crashing. Only installed when missing — real DOMs keep their native impl.
if (typeof Range !== 'undefined' && typeof Range.prototype.getClientRects !== 'function') {
  Range.prototype.getClientRects = function getClientRects() {
    return {
      length: 0,
      item: () => null,
      [Symbol.iterator]: function* () {},
    } as unknown as DOMRectList
  }
}
if (typeof Range !== 'undefined' && typeof Range.prototype.getBoundingClientRect !== 'function') {
  Range.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect
  }
}

// jsdom doesn't implement IntersectionObserver, but framer-motion's
// `whileInView` mounts an observer when motion components render. Provide a
// no-op stub so motion primitives can render in tests without crashing. Real
// viewport behavior is verified in browser smoke checks, not unit tests.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class IntersectionObserverStub {
    readonly root: Element | Document | null = null
    readonly rootMargin: string = ''
    readonly thresholds: ReadonlyArray<number> = []
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }
  ;(globalThis as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver
}
