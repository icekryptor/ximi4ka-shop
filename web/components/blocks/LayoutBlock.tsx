import Image from 'next/image'
import type { LayoutBlock as LayoutBlockType } from '@ximi4ka-shop/shared'
import { MediaFrame } from '@/components/ui/MediaFrame'
import { sanitizeHtml } from '@/lib/sanitizeHtml'

interface Props {
  block: LayoutBlockType
}

/**
 * Composite block: text pane + image pane in one of five arrangements.
 *
 * Variants are *text-positional* (legacy semantics preserved):
 *   text-left   — text on left, media on right (md+ horizontal grid)
 *   text-right  — media on left, text on right (md+ horizontal grid)
 *   text-top    — text above, media below (single column)
 *   text-bottom — media above, text below (single column)
 *   overlay     — text overlaid on top of the full-bleed image
 *
 * v3 lab-journal styling:
 * - Image rendered through MediaFrame (cream-shade backdrop, ink-rule border,
 *   "arr. layout" mono corner mark) so it harmonises with ImageBlock /
 *   GalleryBlock / VideoBlock.
 * - Text pane uses the same `lj-prose` rhythm as ParagraphBlock so authored
 *   HTML inherits italic-brand <strong>, mono <code>, etc.
 * - Overlay variant keeps the dark scrim + inverted prose so light text on
 *   image stays legible regardless of the photo.
 *
 * Body HTML is sanitized via isomorphic-dompurify (defense-in-depth — the
 * admin editor also sanitizes on save).
 */
export function LayoutBlock({ block }: Props) {
  const safeHtml = sanitizeHtml(block.text.html)

  // Overlay is its own animal — full-bleed image with text scrimmed on top.
  if (block.variant === 'overlay') {
    return (
      <div
        data-block="layout"
        data-variant="overlay"
        className="relative overflow-hidden border border-[var(--color-lj-rule)] max-w-[var(--max-lj-content)] mx-auto"
      >
        <div className="relative w-full" style={{ aspectRatio: '16 / 9' }}>
          <Image
            src={block.image.url}
            alt={block.image.alt}
            fill
            sizes="(max-width: 768px) 100vw, 1600px"
            className="object-cover"
          />
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--color-lj-ink)_55%,transparent)] p-8 md:p-12">
          <div
            className="lj-prose font-lj-body text-[1.0625rem] leading-[1.6] text-[var(--color-lj-cream)] max-w-[60ch] text-center [&_strong]:italic [&_strong]:text-[var(--color-lj-cream)] [&_strong]:font-[700] [&_a]:underline [&_a]:underline-offset-4 [&_p]:mb-4 [&_p:last-child]:mb-0"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        </div>
      </div>
    )
  }

  // Non-overlay: positional grid.
  const isHorizontal = block.variant === 'text-left' || block.variant === 'text-right'
  const textFirst = block.variant === 'text-left' || block.variant === 'text-top'
  const layoutClass = isHorizontal
    ? 'md:grid-cols-2 items-center'
    : 'grid-cols-1'

  const media = (
    <MediaFrame
      cornerMark="arr. layout"
      aspectRatio={isHorizontal ? '4/5' : '16/9'}
    >
      <Image
        src={block.image.url}
        alt={block.image.alt}
        fill
        sizes={isHorizontal ? '(max-width: 768px) 100vw, 50vw' : '(max-width: 768px) 100vw, 1200px'}
        className="object-cover"
      />
    </MediaFrame>
  )

  const text = (
    <div
      className="lj-prose font-lj-body text-[1.0625rem] leading-[1.6] text-[var(--color-lj-ink)] max-w-[60ch] [&_strong]:italic [&_strong]:text-[var(--color-lj-brand)] [&_strong]:font-[700] [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-[var(--color-lj-brand-deep)] [&_code]:font-lj-mono [&_code]:text-[var(--color-lj-brand-deep)] [&_p]:mb-4 [&_p:last-child]:mb-0"
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  )

  return (
    <div
      data-block="layout"
      data-variant={block.variant}
      className={`grid gap-10 md:gap-12 max-w-[var(--max-lj-content)] mx-auto ${layoutClass}`}
    >
      {textFirst ? text : media}
      {textFirst ? media : text}
    </div>
  )
}
