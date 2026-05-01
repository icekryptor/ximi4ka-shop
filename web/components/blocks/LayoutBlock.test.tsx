import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { LayoutBlock } from './LayoutBlock'
import type { LayoutVariant } from '@ximi4ka-shop/shared'

afterEach(() => {
  cleanup()
})

const baseProps = {
  type: 'layout' as const,
  text: { html: '<p>Body text content</p>' },
  image: { url: '/img.png', alt: 'Alt' },
}

describe('<LayoutBlock> v3', () => {
  it.each<LayoutVariant>(['text-left', 'text-right', 'text-top', 'text-bottom', 'overlay'])(
    'renders variant %s with data-block="layout" + data-variant marker',
    (variant) => {
      const { container } = render(<LayoutBlock block={{ ...baseProps, variant }} />)
      const root = container.querySelector('[data-block="layout"]')
      expect(root).not.toBeNull()
      expect(root?.getAttribute('data-variant')).toBe(variant)
      expect(container.innerHTML).toContain('<p>Body text content</p>')
    },
  )

  it('renders MediaFrame for non-overlay variants (cream-shade frame)', () => {
    for (const variant of ['text-left', 'text-right', 'text-top', 'text-bottom'] as const) {
      cleanup()
      const { container } = render(<LayoutBlock block={{ ...baseProps, variant }} />)
      expect(container.querySelector('[data-frame]')).not.toBeNull()
    }
  })

  it('renders body via lj-prose class for non-overlay variants', () => {
    const { container } = render(
      <LayoutBlock block={{ ...baseProps, variant: 'text-left' }} />,
    )
    expect(container.querySelector('.lj-prose')).not.toBeNull()
  })

  it('orders text before media for text-left variant', () => {
    const { container } = render(
      <LayoutBlock block={{ ...baseProps, variant: 'text-left' }} />,
    )
    const root = container.querySelector('[data-block="layout"]')!
    const first = root.children[0] as HTMLElement
    // Text pane has lj-prose; media pane has [data-frame]
    expect(first.querySelector('.lj-prose') ?? first.classList.contains('lj-prose')).toBeTruthy()
  })

  it('orders media before text for text-right variant', () => {
    const { container } = render(
      <LayoutBlock block={{ ...baseProps, variant: 'text-right' }} />,
    )
    const root = container.querySelector('[data-block="layout"]')!
    const first = root.children[0] as HTMLElement
    expect(first.querySelector('[data-frame]')).not.toBeNull()
  })

  it('orders text before media for text-top variant (vertical)', () => {
    const { container } = render(
      <LayoutBlock block={{ ...baseProps, variant: 'text-top' }} />,
    )
    const root = container.querySelector('[data-block="layout"]')!
    const first = root.children[0] as HTMLElement
    expect(first.querySelector('.lj-prose') ?? first.classList.contains('lj-prose')).toBeTruthy()
  })

  it('orders media before text for text-bottom variant (vertical)', () => {
    const { container } = render(
      <LayoutBlock block={{ ...baseProps, variant: 'text-bottom' }} />,
    )
    const root = container.querySelector('[data-block="layout"]')!
    const first = root.children[0] as HTMLElement
    expect(first.querySelector('[data-frame]')).not.toBeNull()
  })

  it('overlay variant places sanitized text on top of the image', () => {
    const { container } = render(
      <LayoutBlock block={{ ...baseProps, variant: 'overlay' }} />,
    )
    const root = container.querySelector('[data-block="layout"][data-variant="overlay"]')
    expect(root).not.toBeNull()
    // overlay still renders an image (via Image or MediaFrame)
    const hasImage =
      container.querySelector('img') !== null ||
      container.querySelector('[data-frame]') !== null
    expect(hasImage).toBe(true)
    expect(container.innerHTML).toContain('Body text content')
  })

  it('sanitizes the text HTML across variants', () => {
    for (const variant of ['text-left', 'overlay'] as const) {
      cleanup()
      const { container } = render(
        <LayoutBlock
          block={{
            ...baseProps,
            variant,
            text: { html: '<p>x</p><script>bad()</script>' },
          }}
        />,
      )
      expect(container.querySelector('script')).toBeNull()
      expect(container.innerHTML).not.toContain('bad()')
    }
  })
})
