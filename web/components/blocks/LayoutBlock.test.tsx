import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { LayoutBlock } from './LayoutBlock'
import type { LayoutVariant } from '@ximi4ka-shop/shared'

afterEach(() => {
  cleanup()
})

const baseProps = {
  type: 'layout' as const,
  text: { html: '<p>Body</p>' },
  image: { url: '/img.png', alt: 'Alt' },
}

describe('LayoutBlock', () => {
  it.each<LayoutVariant>(['text-left', 'text-right', 'text-top', 'text-bottom', 'overlay'])(
    'renders variant %s with an img and the sanitized text',
    (variant) => {
      const { container } = render(<LayoutBlock block={{ ...baseProps, variant }} />)
      const root = container.querySelector('[data-block="layout"]')
      expect(root).not.toBeNull()
      expect(root?.getAttribute('data-variant')).toBe(variant)
      const img = container.querySelector('img')
      expect(img?.getAttribute('src')).toBe('/img.png')
      expect(img?.getAttribute('alt')).toBe('Alt')
      expect(container.innerHTML).toContain('<p>Body</p>')
    },
  )

  it('orders text before image for text-left variant', () => {
    const { container } = render(
      <LayoutBlock block={{ ...baseProps, variant: 'text-left' }} />,
    )
    const root = container.querySelector('[data-block="layout"]')!
    const children = Array.from(root.children)
    // First child should be the text div (contains <p>); second should be img.
    expect(children[0].tagName.toLowerCase()).toBe('div')
    expect(children[1].tagName.toLowerCase()).toBe('img')
  })

  it('orders image before text for text-right variant', () => {
    const { container } = render(
      <LayoutBlock block={{ ...baseProps, variant: 'text-right' }} />,
    )
    const root = container.querySelector('[data-block="layout"]')!
    const children = Array.from(root.children)
    expect(children[0].tagName.toLowerCase()).toBe('img')
    expect(children[1].tagName.toLowerCase()).toBe('div')
  })

  it('sanitizes the text HTML', () => {
    const { container } = render(
      <LayoutBlock
        block={{
          ...baseProps,
          variant: 'text-left',
          text: { html: '<p>x</p><script>bad()</script>' },
        }}
      />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.innerHTML).not.toContain('bad()')
  })
})
