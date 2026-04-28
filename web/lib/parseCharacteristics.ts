import type { Block } from '@ximi4ka-shop/shared'
import { isBlock } from '@ximi4ka-shop/shared/types/blocks'

const CHARACTERISTICS_HEADING = 'Характеристики'

/**
 * Extract structured characteristics from the longDescriptionBlocks.
 *
 * Scans for a paragraph block whose HTML starts with `<h3>Характеристики</h3>`
 * (case-insensitive match on the heading text). Within that block, parses each
 * `<li><strong>Key:</strong> Value</li>` into a Record.
 *
 * Returns an empty object if no characteristics block is found or the parse
 * fails for any reason.
 */
export function parseCharacteristics(blocks: unknown[]): Record<string, string> {
  if (!Array.isArray(blocks)) return {}

  const charBlock = blocks.find((b): b is Block => {
    if (!isBlock(b)) return false
    if (b.type !== 'paragraph') return false
    const html = (b as { html?: string }).html ?? ''
    return new RegExp(`<h3[^>]*>\\s*${CHARACTERISTICS_HEADING}\\s*</h3>`, 'i').test(html)
  })

  if (!charBlock) return {}

  const html = (charBlock as { html?: string }).html ?? ''

  const result: Record<string, string> = {}
  // Match <li> ... <strong>Key:</strong> Value </li>
  const liRegex = /<li[^>]*>\s*<strong>([^<]+):\s*<\/strong>\s*([\s\S]*?)<\/li>/gi
  let m: RegExpExecArray | null
  while ((m = liRegex.exec(html)) !== null) {
    const key = m[1].trim()
    // Strip any inner HTML tags from the value, decode common entities.
    const value = m[2]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim()
    if (key && value) result[key] = value
  }
  return result
}
