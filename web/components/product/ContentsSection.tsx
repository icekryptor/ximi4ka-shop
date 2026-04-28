import type { Block } from '@ximi4ka-shop/shared'
import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import { DarkSection, Container, DisplayHeading } from '@/components/ui'
import { MoleculeMotif } from '@/components/decor'

const CONTENTS_HEADING_RE = /<h3[^>]*>\s*Состав\s*<\/h3>/i

interface Props {
  blocks: unknown[]
  className?: string
}

/**
 * Detects whether the long-description has a structured «Состав» paragraph
 * block (typical for kit products imported from Tilda) and renders a
 * DarkSection «Что внутри» with the parsed list. Returns null otherwise so
 * the consuming page can render this unconditionally.
 */
export function ContentsSection({ blocks, className = '' }: Props) {
  if (!Array.isArray(blocks)) return null

  const sostavBlock = blocks.find((b): b is Block => {
    if (!isBlock(b)) return false
    if (b.type !== 'paragraph') return false
    const html = (b as { html?: string }).html ?? ''
    return CONTENTS_HEADING_RE.test(html)
  })

  if (!sostavBlock) return null

  const rawHtml = (sostavBlock as { html?: string }).html ?? ''
  // Strip the leading <h3>Состав</h3> — we render our own «Что внутри» heading.
  const bodyHtml = rawHtml.replace(CONTENTS_HEADING_RE, '').trim()
  const cleaned = sanitizeHtml(bodyHtml)

  return (
    <DarkSection size="lg" glow className={className}>
      <Container>
        <div className="relative grid gap-12 md:grid-cols-[1fr_2fr] md:gap-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-32 -right-32 -z-10 h-[600px] w-[600px] opacity-20"
          >
            <MoleculeMotif variant="vivid" />
          </div>
          <div>
            <DisplayHeading as="h2" className="!text-[var(--color-text-on-dark)]">
              Что внутри
            </DisplayHeading>
          </div>
          <div
            className="prose-on-dark text-[length:var(--text-body)] leading-[var(--leading-body)] text-[var(--color-text-on-dark)]"
            dangerouslySetInnerHTML={{ __html: cleaned }}
          />
        </div>
      </Container>
    </DarkSection>
  )
}
