import Image from 'next/image'
import type { ImageBlock as ImageBlockType } from '@ximi4ka-shop/shared'
import { MediaFrame } from '@/components/ui/MediaFrame'

interface Props {
  block: ImageBlockType
}

/**
 * Renders a CMS image block via the v3 lab-journal MediaFrame primitive
 * (cream-shade backdrop, ink rule border, mono "arr. img" corner mark,
 * optional caption beneath).
 *
 * Uses next/image with `fill` so the frame's CSS aspect-ratio governs the
 * box; aspect defaults to 4/5 (portrait, matches PDP hero) since the shared
 * ImageBlock type doesn't carry an aspectRatio field. If width/height are
 * present we still ignore them for layout — `fill` covers the frame and
 * `object-cover` crops gracefully.
 *
 * Next.js 16 note: `priority` is deprecated; use `preload` if eager loading
 * is ever needed (CMS images are below-the-fold by default, so not set).
 */
export function ImageBlock({ block }: Props) {
  return (
    <div data-block="image">
      <MediaFrame
        cornerMark="arr. img"
        caption={block.caption ?? undefined}
        aspectRatio="4/5"
        className="max-w-[var(--max-lj-narrow)] mx-auto"
      >
        <Image
          src={block.url}
          alt={block.alt}
          fill
          sizes="(max-width: 768px) 100vw, 800px"
          className="object-cover"
        />
      </MediaFrame>
    </div>
  )
}
