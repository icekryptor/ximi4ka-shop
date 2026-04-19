import type { ImageBlock as ImageBlockType } from '@ximi4ka-shop/shared'

interface Props {
  block: ImageBlockType
}

export function ImageBlock({ block }: Props) {
  return (
    <figure data-block="image" className="my-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={block.url}
        alt={block.alt}
        width={block.width ?? undefined}
        height={block.height ?? undefined}
        className="w-full h-auto rounded-2xl"
      />
      {block.caption ? (
        <figcaption className="mt-2 text-sm text-gray-500 text-center">
          {block.caption}
        </figcaption>
      ) : null}
    </figure>
  )
}
