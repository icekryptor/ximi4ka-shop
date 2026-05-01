import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  cornerMark: string
  caption?: string
  /** CSS aspect-ratio value, e.g. '4/5', '16/9', '1/1' */
  aspectRatio?: string
  className?: string
}

/**
 * Cream-shade backdrop + ink border + mono corner mark + optional caption.
 * Shared by ImageBlock / GalleryBlock / VideoBlock and PDP product images.
 */
export function MediaFrame({
  children, cornerMark, caption, aspectRatio = '4/5', className = '',
}: Props) {
  return (
    <figure className={`flex flex-col gap-3 ${className}`.trim()}>
      <div
        data-frame
        className="relative bg-[var(--color-lj-cream-shade)] border border-[var(--color-lj-rule)] overflow-hidden transition-[border-color] duration-500 hover:border-[var(--color-lj-ink)]"
        style={{ aspectRatio: aspectRatio.replace('/', ' / ') }}
      >
        <span className="absolute top-3.5 left-3.5 z-[2] font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-ink)] opacity-55">
          {cornerMark}
        </span>
        {children}
      </div>
      {caption && (
        <figcaption
          data-caption
          className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-70"
        >
          — {caption}
        </figcaption>
      )}
    </figure>
  )
}
