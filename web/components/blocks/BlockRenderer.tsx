import { Suspense } from 'react'
import type { Block } from '@ximi4ka-shop/shared'
import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
import { ParagraphBlock } from './ParagraphBlock'
import { ImageBlock } from './ImageBlock'
import { GalleryBlock } from './GalleryBlock'
import { LayoutBlock } from './LayoutBlock'
import { CtaBlock } from './CtaBlock'
import { VideoBlock } from './VideoBlock'
import { FaqBlock } from './FaqBlock'
import { ProductGridBlock } from './ProductGridBlock'

interface Props {
  blocks: unknown[]
}

function renderBlock(block: Block, key: number) {
  switch (block.type) {
    case 'paragraph':
      return <ParagraphBlock key={key} block={block} />
    case 'image':
      return <ImageBlock key={key} block={block} />
    case 'gallery':
      return <GalleryBlock key={key} block={block} />
    case 'layout':
      return <LayoutBlock key={key} block={block} />
    case 'cta':
      return <CtaBlock key={key} block={block} />
    case 'video':
      return <VideoBlock key={key} block={block} />
    case 'faq':
      return <FaqBlock key={key} block={block} />
    case 'product_grid':
      return (
        <Suspense
          key={key}
          fallback={<div className="text-gray-500">Загрузка товаров...</div>}
        >
          {/* ProductGridBlock is async; React 19 handles awaiting it. */}
          <ProductGridBlock block={block} />
        </Suspense>
      )
  }
}

export function BlockRenderer({ blocks }: Props) {
  const validBlocks = blocks.filter(isBlock)
  if (validBlocks.length === 0) return null
  return (
    <div className="space-y-6" data-block-renderer>
      {validBlocks.map((block, i) => renderBlock(block, i))}
    </div>
  )
}
