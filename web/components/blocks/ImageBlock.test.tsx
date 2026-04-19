import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { ImageBlock } from './ImageBlock'

afterEach(() => {
  cleanup()
})

describe('ImageBlock', () => {
  it('renders the image with src and alt', () => {
    const { container } = render(
      <ImageBlock block={{ type: 'image', url: '/foo.png', alt: 'Foo' }} />,
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('/foo.png')
    expect(img?.getAttribute('alt')).toBe('Foo')
  })

  it('renders a figcaption when caption is provided', () => {
    const { container } = render(
      <ImageBlock
        block={{ type: 'image', url: '/foo.png', alt: 'Foo', caption: 'A caption' }}
      />,
    )
    const caption = container.querySelector('figcaption')
    expect(caption).not.toBeNull()
    expect(caption?.textContent).toBe('A caption')
  })

  it('omits figcaption when no caption is provided', () => {
    const { container } = render(
      <ImageBlock block={{ type: 'image', url: '/foo.png', alt: 'Foo' }} />,
    )
    expect(container.querySelector('figcaption')).toBeNull()
  })

  it('passes width and height to the img element when present', () => {
    const { container } = render(
      <ImageBlock
        block={{ type: 'image', url: '/foo.png', alt: 'Foo', width: 800, height: 600 }}
      />,
    )
    const img = container.querySelector('img')
    expect(img?.getAttribute('width')).toBe('800')
    expect(img?.getAttribute('height')).toBe('600')
  })
})
