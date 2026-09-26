import type { Block } from '@ximi4ka-shop/shared'
import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import { LabSection } from '@/components/ui/LabSection'
import { MoleculeMotifLJ } from '@/components/decor/MoleculeMotif.lj'

const CONTENTS_HEADING_RE = /<h3[^>]*>\s*Состав\s*<\/h3>/i

interface Props {
  blocks: unknown[]
  className?: string
}

/**
 * Sanitized body of the long-description «Состав» paragraph block (typical
 * for kit products imported from Tilda), without its `<h3>Состав</h3>`
 * heading. Null when the product has no such block. Shared by the ink
 * «Что внутри» section and the «Состав» tab on the product page.
 */
export function extractContentsHtml(blocks: unknown[]): string | null {
  if (!Array.isArray(blocks)) return null

  const sostavBlock = blocks.find((b): b is Block => {
    if (!isBlock(b)) return false
    if (b.type !== 'paragraph') return false
    const html = (b as { html?: string }).html ?? ''
    return CONTENTS_HEADING_RE.test(html)
  })

  if (!sostavBlock) return null

  const rawHtml = (sostavBlock as { html?: string }).html ?? ''
  return sanitizeHtml(rawHtml.replace(CONTENTS_HEADING_RE, '').trim())
}

/**
 * Renders an ink LabSection «Что внутри» with the parsed «Состав» list.
 * Returns null otherwise so the consuming page can render this
 * unconditionally.
 */
export function ContentsSection({ blocks, className = '' }: Props) {
  const cleaned = extractContentsHtml(blocks)
  if (cleaned == null) return null

  return (
    <LabSection variant="ink" className={`px-6 py-32 ${className}`.trim()}>
      {/* Background ghost molecule */}
      <MoleculeMotifLJ
        variant="anthracene"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1] pointer-events-none text-[var(--color-lj-bone)] opacity-[0.05] [animation:lj-rotate-slow-reverse_200s_linear_infinite]"
        style={{ width: 'clamp(600px, 90vmin, 1100px)', height: 'clamp(600px, 90vmin, 1100px)' }}
      />

      <div className="relative z-[2] max-w-[var(--max-lj-narrow)] mx-auto">
        <h2 className="font-lj-display font-[700] text-[length:var(--text-lj-display)] leading-[1.0] tracking-[-0.04em] mb-16 max-w-[18ch]">
          <span>Что </span>
          <em className="italic text-[var(--color-lj-brand)] font-[700] relative after:absolute after:content-[''] after:left-0 after:right-0 after:bottom-1 after:h-[5px] after:bg-[var(--color-lj-brand)] after:opacity-50 after:rounded-sm">
            внутри
          </em>
          <span> набора</span>
        </h2>

        <div
          className="prose-on-dark max-w-[56ch] text-xl leading-[1.55] text-[rgba(239,237,230,0.78)]"
          dangerouslySetInnerHTML={{ __html: cleaned }}
        />
      </div>
    </LabSection>
  )
}
