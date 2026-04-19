import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { BlockRenderer } from './BlockRenderer'

afterEach(() => {
  cleanup()
})

describe('BlockRenderer', () => {
  it('renders nothing for an empty array', () => {
    const { container } = render(<BlockRenderer blocks={[]} />)
    expect(container.querySelector('[data-block-renderer]')).toBeNull()
  })

  it('filters out invalid/unknown blocks', () => {
    const { container } = render(
      <BlockRenderer
        blocks={[
          null,
          'not-a-block',
          { type: 'unknown', foo: 'bar' },
          { type: 'paragraph', html: '<p>Real</p>' },
        ]}
      />,
    )
    const wrapper = container.querySelector('[data-block-renderer]')
    expect(wrapper).not.toBeNull()
    // Only one valid paragraph block should have rendered.
    expect(wrapper?.querySelectorAll('[data-block]').length).toBe(1)
    expect(wrapper?.querySelector('[data-block="paragraph"]')).not.toBeNull()
  })

  it('dispatches to the correct sync component per type', () => {
    const { container } = render(
      <BlockRenderer
        blocks={[
          { type: 'paragraph', html: '<p>p</p>' },
          { type: 'image', url: '/x.png', alt: 'x' },
          {
            type: 'gallery',
            images: [{ url: '/a.png', alt: 'a' }],
          },
          {
            type: 'layout',
            variant: 'text-left',
            text: { html: '<p>l</p>' },
            image: { url: '/l.png', alt: 'l' },
          },
          {
            type: 'cta',
            heading: 'h',
            buttonLabel: 'go',
            buttonHref: '/',
          },
          { type: 'video', provider: 'youtube', videoId: 'vid' },
          {
            type: 'faq',
            items: [{ question: 'q', answer: 'a' }],
          },
        ]}
      />,
    )
    expect(container.querySelector('[data-block="paragraph"]')).not.toBeNull()
    expect(container.querySelector('[data-block="image"]')).not.toBeNull()
    expect(container.querySelector('[data-block="gallery"]')).not.toBeNull()
    expect(container.querySelector('[data-block="layout"]')).not.toBeNull()
    expect(container.querySelector('[data-block="cta"]')).not.toBeNull()
    expect(container.querySelector('[data-block="video"]')).not.toBeNull()
    expect(container.querySelector('[data-block="faq"]')).not.toBeNull()
  })

  it('wraps product_grid in Suspense with a Russian fallback', () => {
    // ProductGridBlock is async and will suspend during synchronous render —
    // RTL should see the Suspense fallback.
    const { container } = render(
      <BlockRenderer
        blocks={[{ type: 'product_grid', productSlugs: ['nope'] }]}
      />,
    )
    expect(container.textContent).toContain('Загрузка товаров')
  })
})
