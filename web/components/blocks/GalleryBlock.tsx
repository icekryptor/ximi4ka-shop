import type { GalleryBlock as GalleryBlockType } from '@ximi4ka-shop/shared'

interface Props {
  block: GalleryBlockType
}

export function GalleryBlock({ block }: Props) {
  if (block.images.length === 0) return null
  return (
    <div
      data-block="gallery"
      className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-4"
    >
      {block.images.map((image, i) => (
        <div key={i} className="aspect-square overflow-hidden rounded-2xl bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt={image.alt}
            className="w-full h-full object-cover"
          />
        </div>
      ))}
    </div>
  )
}
