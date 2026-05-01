import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { GalleryBlock } from './GalleryBlock'

afterEach(() => {
  cleanup()
})

describe('<GalleryBlock> v3', () => {
  it('renders one MediaFrame per image', () => {
    const block = {
      type: 'gallery' as const,
      images: [
        { url: '/a.jpg', alt: 'A' },
        { url: '/b.jpg', alt: 'B' },
        { url: '/c.jpg', alt: 'C' },
      ],
    }
    const { container } = render(<GalleryBlock block={block} />)
    expect(container.querySelectorAll('[data-frame]').length).toBe(3)
  })

  it('preserves data-block="gallery" marker for BlockRenderer contract', () => {
    const block = { type: 'gallery' as const, images: [{ url: '/a.jpg', alt: '' }] }
    const { container } = render(<GalleryBlock block={block} />)
    expect(container.querySelector('[data-block="gallery"]')).not.toBeNull()
  })

  it('renders nothing visible when images array is empty (or wraps a no-op)', () => {
    const block = { type: 'gallery' as const, images: [] }
    const { container } = render(<GalleryBlock block={block} />)
    expect(container.querySelectorAll('[data-frame]').length).toBe(0)
  })
})
