import DOMPurify from 'isomorphic-dompurify'

/**
 * Sanitize user-authored HTML coming out of the admin editor before it is
 * injected via dangerouslySetInnerHTML. Strips <script>, inline event
 * handlers, javascript: URLs, and other XSS vectors while preserving the
 * rich-text tags Tiptap actually produces (headings, lists, links, etc.).
 */
export function sanitizeHtml(input: string): string {
  return DOMPurify.sanitize(input, {
    USE_PROFILES: { html: true },
    // Safe anchor targets need rel noopener; DOMPurify adds these automatically
    // when ADD_ATTR allows them, but the default HTML profile already keeps
    // target/rel on anchors. We don't need additional configuration here.
  })
}
