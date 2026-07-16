import sanitizeHtmlLib from 'sanitize-html'

/**
 * Sanitize user-authored HTML coming out of the admin editor before it is
 * injected via dangerouslySetInnerHTML. Strips <script>, inline event
 * handlers, javascript: URLs, and other XSS vectors while preserving the
 * rich-text tags Tiptap actually produces (headings, lists, links, etc.).
 *
 * Uses `sanitize-html` (a pure-Node HTML parser) rather than DOMPurify: this
 * runs inside React Server Components on Vercel's serverless runtime, where
 * DOMPurify's jsdom dependency fails to load (ERR_REQUIRE_ESM).
 */
export function sanitizeHtml(input: string): string {
  if (!input) return ''
  return sanitizeHtmlLib(input, {
    allowedTags: [
      'p', 'br', 'hr', 'span', 'mark', 'sub', 'sup',
      'strong', 'b', 'em', 'i', 'u', 's', 'strike',
      'code', 'pre', 'blockquote',
      'ul', 'ol', 'li',
      'a',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
    },
    // Only safe URL schemes on links; drops javascript:/data: vectors.
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    // Force safe rel on new-tab links.
    transformTags: {
      a: (tagName, attribs) => {
        if (attribs.target === '_blank') {
          attribs.rel = 'noopener noreferrer'
        }
        return { tagName, attribs }
      },
    },
  })
}
