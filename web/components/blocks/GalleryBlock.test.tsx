import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { GalleryBlock } from './GalleryBlock'

afterEach(() => {
  cleanup()
})

describe('GalleryBlock', () => {
  it('renders one img per image entry', () => {
    const { container } = render(
      <GalleryBlock
        block={{
          type: 'gallery',
          images: [
            { url: '/a.png', alt: 'A' },
            { url: '/b.png', alt: 'B' },
            { url: '/c.png', alt: 'C' },
          ],
        }}
      />,
    )
    const imgs = container.querySelectorAll('img')
    expect(imgs.length).toBe(3)
    expect(imgs[0].getAttribute('src')).toBe('/a.png')
    expect(imgs[2].getAttribute('alt')).toBe('C')
  })

  it('renders nothing when the images array is empty', () => {
    const { container } = render(<GalleryBlock block={{ type: 'gallery', images: [] }} />)
    expect(container.querySelector('[data-block="gallery"]')).toBeNull()
  })
})
