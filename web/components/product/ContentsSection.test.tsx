import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ContentsSection } from './ContentsSection'

const sostavHtml =
  '<h3>Состав</h3>\n<strong>17 реактивов:</strong><br><ul>' +
  '<li data-list="bullet">сульфат алюминия 35 мл 5% р-р</li>' +
  '<li data-list="bullet">нитрат серебра 35 мл 1% р-р</li>' +
  '</ul>'

describe('ContentsSection', () => {
  it('renders nothing when blocks array is empty', () => {
    const { container } = render(<ContentsSection blocks={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when no Состав block is present', () => {
    const { container } = render(
      <ContentsSection
        blocks={[
          { type: 'paragraph', html: '<p>just description</p>' },
          { type: 'paragraph', html: '<h3>Характеристики</h3><ul></ul>' },
        ]}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when blocks is not an array', () => {
    const { container } = render(
      <ContentsSection blocks={null as unknown as unknown[]} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the «Что внутри» section when a Состав block is present', () => {
    render(
      <ContentsSection
        blocks={[{ type: 'paragraph', html: sostavHtml }]}
      />,
    )
    expect(screen.getByText('Что внутри')).toBeInTheDocument()
    expect(
      screen.getByText('сульфат алюминия 35 мл 5% р-р'),
    ).toBeInTheDocument()
  })

  it('strips the leading «Состав» heading from the rendered body', () => {
    const { container } = render(
      <ContentsSection
        blocks={[{ type: 'paragraph', html: sostavHtml }]}
      />,
    )
    // No <h3>Состав</h3> should remain — only our «Что внутри» heading.
    const innerH3s = Array.from(container.querySelectorAll('h3'))
    expect(innerH3s.some((h) => h.textContent?.trim() === 'Состав')).toBe(false)
  })

  it('sanitizes <script> tags from the input', () => {
    const malicious =
      '<h3>Состав</h3><script>alert(1)</script><ul><li>safe</li></ul>'
    const { container } = render(
      <ContentsSection blocks={[{ type: 'paragraph', html: malicious }]} />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText('safe')).toBeInTheDocument()
  })

  it('forwards className onto the DarkSection root', () => {
    const { container } = render(
      <ContentsSection
        blocks={[{ type: 'paragraph', html: sostavHtml }]}
        className="my-custom-class"
      />,
    )
    const root = container.querySelector('section')
    expect(root).not.toBeNull()
    expect(root?.className).toContain('my-custom-class')
  })
})
