import type { ParagraphBlock as ParagraphBlockType } from '@ximi4ka-shop/shared'
import { sanitizeHtml } from '@/lib/sanitizeHtml'

interface Props {
  block: ParagraphBlockType
}

/**
 * Renders sanitized rich-text HTML with v3 lab-journal prose styles.
 *
 * Tailwind 4 arbitrary child selectors style nested HTML elements without
 * inline classes on every tag:
 *   [&_strong]:italic + [&_strong]:text-[brand]   — bold becomes italic emphasis
 *                                                    in brand purple (lab annotation
 *                                                    feel, not visual shouting)
 *   [&_a]:underline + offset-4                    — links underlined, hover deepens
 *   [&_code]:font-mono + brand-deep               — inline code in JetBrains Mono
 *   [&_p]:mb-4 + [&_p:last-child]:mb-0            — paragraph rhythm
 *
 * HTML is sanitized via isomorphic-dompurify before injection (defense-in-depth;
 * the upstream admin RichTextEditor also sanitizes on save).
 *
 * Surface note: text colour is hardcoded to --color-lj-ink (correct on cream
 * surfaces, the default in v3). If wrapped in an ink-surface LabSection later,
 * this won't inherit — add a `surface` prop or swap to a CSS variable that
 * cascades from the parent.
 */
export function ParagraphBlock({ block }: Props) {
  const safeHtml = sanitizeHtml(block.html)
  return (
    <div
      className="lj-prose font-lj-body text-[1.0625rem] leading-[1.6] text-[var(--lj-prose-color,var(--color-lj-ink))] max-w-[60ch] [&_strong]:italic [&_strong]:text-[var(--color-lj-brand)] [&_strong]:font-[700] [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-[var(--color-lj-brand-deep)] [&_code]:font-lj-mono [&_code]:text-[var(--color-lj-brand-deep)] [&_p]:mb-4 [&_p:last-child]:mb-0"
      data-block="paragraph"
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  )
}
