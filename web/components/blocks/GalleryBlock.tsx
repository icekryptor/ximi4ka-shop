import Image from 'next/image'
import type { GalleryBlock as GalleryBlockType } from '@ximi4ka-shop/shared'
import { MediaFrame } from '@/components/ui/MediaFrame'

interface Props {
  block: GalleryBlockType
}

export function GalleryBlock({ block }: Props) {
  const n = block.images.length
  // 2-up at >=md, 4-up at >=lg if exactly 4 images, otherwise 3-up at >=lg
  const cols =
    n === 2
      ? 'md:grid-cols-2'
      : n === 4
        ? 'md:grid-cols-2 lg:grid-cols-4'
        : 'md:grid-cols-2 lg:grid-cols-3'
  const pad = (i: number) => String(i + 1).padStart(2, '0')
  return (
    <div
      data-block="gallery"
      className={`grid grid-cols-1 ${cols} gap-5 max-w-[var(--max-lj-content)] mx-auto`}
    >
      {block.images.map((img, i) => (
        <MediaFrame
          key={img.url}
          cornerMark={`arr. ${pad(i)}`}
          caption={(img as { caption?: string | null }).caption ?? undefined}
          aspectRatio="1/1"
        >
          <Image
            src={img.url}
            alt={img.alt}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover"
          />
        </MediaFrame>
      ))}
    </div>
  )
}
