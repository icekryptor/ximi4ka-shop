import DOMPurify from 'isomorphic-dompurify'

// Sanitize HTML coming from the Tilda CSV. The export is from a controlled
// admin we trust, but we still scrub <script>, event handlers, and javascript:
// URLs as defense-in-depth — the same content will be rendered by the public
// product page, so any escape we miss here gets reflected to end users.
//
// We allow the formatting tags Tilda actually uses: p, br, strong, em, b, i,
// u, ul, ol, li, a, h1-h4, blockquote, span. Everything else is stripped.
export function sanitizeHtml(input: string): string {
  if (!input) return ''
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'b',
      'i',
      'u',
      'ul',
      'ol',
      'li',
      'a',
      'h1',
      'h2',
      'h3',
      'h4',
      'blockquote',
      'span',
      'div',
    ],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
  })
}
