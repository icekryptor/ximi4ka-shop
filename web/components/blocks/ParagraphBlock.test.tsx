import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { ParagraphBlock } from './ParagraphBlock'

afterEach(() => {
  cleanup()
})

describe('<ParagraphBlock> v3', () => {
  it('renders sanitized html in v3 prose container with Inter body font', () => {
    const { container } = render(
      <ParagraphBlock block={{ type: 'paragraph', html: '<p>Hello world</p>' }} />,
    )
    const root = container.firstChild as HTMLElement
    expect(root.className).toContain('font-[var(--font-lj-body)]')
    expect(root.innerHTML).toContain('<p>Hello world</p>')
  })

  it('renders <strong> with brand-purple italic via [&_strong] selector', () => {
    const { container } = render(
      <ParagraphBlock block={{ type: 'paragraph', html: '<p>Hello <strong>world</strong></p>' }} />,
    )
    const root = container.firstChild as HTMLElement
    // Class is on the parent container with [&_strong]:... arbitrary child selector
    expect(root.className).toMatch(/\[&_strong\]:.*italic|\[&_strong\]:.*color-lj-brand/)
    // <strong> still present in DOM after sanitization
    const strong = container.querySelector('strong')
    expect(strong).not.toBeNull()
    expect(strong?.textContent).toBe('world')
  })

  it('constrains content to a readable max-width', () => {
    const { container } = render(
      <ParagraphBlock block={{ type: 'paragraph', html: '<p>x</p>' }} />,
    )
    const root = container.firstChild as HTMLElement
    expect(root.className).toContain('max-w-[60ch]')
  })

  it('styles inline <code> with the mono font', () => {
    const { container } = render(
      <ParagraphBlock
        block={{ type: 'paragraph', html: '<p>use <code>npm</code> here</p>' }}
      />,
    )
    const root = container.firstChild as HTMLElement
    expect(root.className).toMatch(/\[&_code\]:.*font-\[var\(--font-lj-mono\)\]/)
    expect(container.querySelector('code')?.textContent).toBe('npm')
  })

  it('strips <script> tags before rendering (defense-in-depth)', () => {
    const { container } = render(
      <ParagraphBlock
        block={{
          type: 'paragraph',
          html: '<p>Hi</p><script>window.pwn = 1</script>',
        }}
      />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.innerHTML).not.toContain('window.pwn')
  })

  it('applies the data-block attribute for DOM identification', () => {
    const { container } = render(
      <ParagraphBlock block={{ type: 'paragraph', html: '<p>x</p>' }} />,
    )
    expect(container.querySelector('[data-block="paragraph"]')).not.toBeNull()
  })
})
