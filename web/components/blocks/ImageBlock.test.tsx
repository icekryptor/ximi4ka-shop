import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ImageBlock } from './ImageBlock'

afterEach(() => {
  cleanup()
})

describe('<ImageBlock> v3', () => {
  it('renders inside a MediaFrame with corner mark', () => {
    const { container } = render(
      <ImageBlock block={{ type: 'image', url: '/test.jpg', alt: 'Test alt' }} />,
    )
    expect(container.querySelector('[data-frame]')).not.toBeNull()
    // Corner mark renders some "arr." text (mono lab-journal annotation).
    expect(screen.getByText(/arr\./i)).toBeInTheDocument()
  })

  it('renders caption inside [data-caption] when provided', () => {
    const { container } = render(
      <ImageBlock
        block={{ type: 'image', url: '/test.jpg', alt: 'x', caption: 'Подпись' }}
      />,
    )
    const caption = container.querySelector('[data-caption]')
    expect(caption).not.toBeNull()
    expect(caption?.textContent).toContain('Подпись')
  })

  it('omits [data-caption] when caption is not provided', () => {
    const { container } = render(
      <ImageBlock block={{ type: 'image', url: '/test.jpg', alt: 'x' }} />,
    )
    expect(container.querySelector('[data-caption]')).toBeNull()
  })

  it('omits [data-caption] when caption is null (DB default)', () => {
    const { container } = render(
      <ImageBlock
        block={{ type: 'image', url: '/test.jpg', alt: 'x', caption: null }}
      />,
    )
    expect(container.querySelector('[data-caption]')).toBeNull()
  })

  it('uses semantic <figure> for the frame', () => {
    const { container } = render(
      <ImageBlock block={{ type: 'image', url: '/test.jpg', alt: 'x' }} />,
    )
    expect(container.querySelector('figure')).not.toBeNull()
  })

  it('renders the image with alt text', () => {
    const { container } = render(
      <ImageBlock block={{ type: 'image', url: '/cat.jpg', alt: 'Cat' }} />,
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('alt')).toBe('Cat')
  })
})
