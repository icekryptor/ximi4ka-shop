import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from './sanitizeHtml'

describe('sanitizeHtml', () => {
  it('preserves safe rich-text tags from the editor', () => {
    const input =
      '<p>Hello <strong>world</strong> and <em>friends</em></p><ul><li>a</li></ul><h2>Heading</h2><a href="https://example.com">link</a>'
    const out = sanitizeHtml(input)
    expect(out).toContain('<strong>world</strong>')
    expect(out).toContain('<em>friends</em>')
    expect(out).toContain('<ul>')
    expect(out).toContain('<h2>Heading</h2>')
    expect(out).toContain('href="https://example.com"')
  })

  it('strips <script> tags', () => {
    const out = sanitizeHtml('<p>ok</p><script>alert(1)</script>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert(1)')
    expect(out).toContain('<p>ok</p>')
  })

  it('strips inline event handlers', () => {
    const out = sanitizeHtml('<p onclick="alert(1)">hi</p>')
    expect(out).not.toContain('onclick')
    expect(out).toContain('hi')
  })

  it('strips javascript: URLs on anchors', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>')
    expect(out).not.toMatch(/href\s*=\s*["']?javascript:/i)
  })

  it('returns an empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('')
  })
})
