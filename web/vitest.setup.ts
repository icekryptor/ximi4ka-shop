import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// With vitest's globals: false, @testing-library/react doesn't auto-register
// its afterEach cleanup. Unmount rendered components between tests or
// getBy* queries see duplicates from the previous case.
afterEach(() => {
  cleanup()
})

// jsdom doesn't implement Range#getClientRects or Element#getClientRects
// fully, which breaks ProseMirror's scrollToSelection path when Tiptap is
// mounted in tests. Provide harmless stubs so the editor can scroll without
// crashing. Only installed when missing — real DOMs keep their native impl.
if (
  typeof Range !== 'undefined' &&
  typeof Range.prototype.getClientRects !== 'function'
) {
  Range.prototype.getClientRects = function getClientRects() {
    return {
      length: 0,
      item: () => null,
      [Symbol.iterator]: function* () {},
    } as unknown as DOMRectList
  }
}
if (
  typeof Range !== 'undefined' &&
  typeof Range.prototype.getBoundingClientRect !== 'function'
) {
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
