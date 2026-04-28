import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from './sanitize-html.js'

describe('sanitizeHtml', () => {
  it('strips <script> tags entirely', () => {
    const out = sanitizeHtml('<p>Hi</p><script>alert(1)</script>')
    expect(out).toContain('<p>Hi</p>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert')
  })

  it('strips inline event handlers', () => {
    const out = sanitizeHtml('<a href="x" onclick="alert(1)">click</a>')
    expect(out).toContain('href')
    expect(out).not.toMatch(/onclick/i)
  })

  it('preserves common formatting tags', () => {
    const out = sanitizeHtml('<p>hello <strong>world</strong></p><ul><li>a</li></ul>')
    expect(out).toContain('<strong>')
    expect(out).toContain('<ul>')
    expect(out).toContain('<li>')
  })

  it('preserves <br /> newlines (Tilda emits these heavily)', () => {
    const out = sanitizeHtml('a<br />b')
    expect(out).toMatch(/<br/)
  })

  it('returns empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('')
  })

  it('strips javascript: URLs', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>')
    expect(out).not.toMatch(/javascript:/i)
  })
})
