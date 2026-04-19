import type { ParagraphBlock as ParagraphBlockType } from '@ximi4ka-shop/shared'
import { sanitizeHtml } from '@/lib/sanitizeHtml'

interface Props {
  block: ParagraphBlockType
}

/**
 * Renders rich-text HTML from the admin editor. HTML is sanitized server-side
 * before being injected via dangerouslySetInnerHTML — never skip the sanitizer.
 */
export function ParagraphBlock({ block }: Props) {
  const safeHtml = sanitizeHtml(block.html)
  return (
    <div
      className="prose max-w-none"
      data-block="paragraph"
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  )
}
