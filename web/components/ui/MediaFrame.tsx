import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  caption?: string
  /** CSS aspect-ratio value, e.g. '4/5', '16/9', '1/1' */
  aspectRatio?: string
  className?: string
}

/**
 * Cream-shade backdrop + ink border + optional caption.
 * Shared by ImageBlock / GalleryBlock / VideoBlock and PDP product images.
 */
export function MediaFrame({ children, caption, aspectRatio = '4/5', className = '' }: Props) {
  return (
    <figure className={`flex flex-col gap-3 ${className}`.trim()}>
      <div
        data-frame
        className="relative bg-[var(--color-lj-cream-shade)] border border-[var(--color-lj-rule)] overflow-hidden transition-[border-color] duration-500 hover:border-[var(--color-lj-ink)]"
        style={{ aspectRatio: aspectRatio.replace('/', ' / ') }}
      >
        {children}
      </div>
      {caption && (
        <figcaption
          data-caption
          className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-70"
        >
          — {caption}
        </figcaption>
      )}
    </figure>
  )
}
