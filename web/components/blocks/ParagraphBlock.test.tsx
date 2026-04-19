import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { ParagraphBlock } from './ParagraphBlock'

afterEach(() => {
  cleanup()
})

describe('ParagraphBlock', () => {
  it('renders sanitized rich-text HTML', () => {
    const { container } = render(
      <ParagraphBlock block={{ type: 'paragraph', html: '<p>Hello <strong>world</strong></p>' }} />,
    )
    const strong = container.querySelector('strong')
    expect(strong).not.toBeNull()
    expect(strong?.textContent).toBe('world')
  })

  it('strips <script> tags before rendering', () => {
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
