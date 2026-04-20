'use client'

import type { Block } from '@ximi4ka-shop/shared'
import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
import { AddBlockMenu } from './AddBlockMenu'
import { BlockToolbar } from './BlockToolbar'
import { BlockPreviewPane } from './BlockPreviewPane'
import { blockDefault } from './blockDefaults'
import { blockLabel } from './blockLabels'
import { ParagraphBlockEditor } from './ParagraphBlockEditor'
import { ImageBlockEditor } from './ImageBlockEditor'
import { GalleryBlockEditor } from './GalleryBlockEditor'
import { LayoutBlockEditor } from './LayoutBlockEditor'
import { CtaBlockEditor } from './CtaBlockEditor'
import { VideoBlockEditor } from './VideoBlockEditor'
import { FaqBlockEditor } from './FaqBlockEditor'
import { ProductGridBlockEditor } from './ProductGridBlockEditor'

interface Props {
  value: unknown[]
  onChange: (blocks: Block[]) => void
}

/**
 * Top-level block editor. Owns no persistent state — it's a controlled
 * component: parent passes `value` and receives typed `Block[]` back.
 * Invalid blocks in `value` are filtered out via `isBlock`, which keeps the
 * editor robust to stale JSONB data.
 */
export function BlockEditor({ value, onChange }: Props) {
  const blocks = value.filter(isBlock)

  function replaceAt(index: number, next: Block) {
    const copy = blocks.slice()
    copy[index] = next
    onChange(copy)
  }

  function remove(index: number) {
    onChange(blocks.filter((_, i) => i !== index))
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= blocks.length) return
    const copy = blocks.slice()
    const tmp = copy[index]
    copy[index] = copy[target]
    copy[target] = tmp
    onChange(copy)
  }

  function add(type: Block['type']) {
    onChange([...blocks, blockDefault(type)])
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="block-editor">
      {/* Editor column */}
      <div>
        <div className="space-y-4">
          {blocks.length === 0 ? (
            <p className="text-sm text-brand-text-secondary italic">
              Блоков пока нет. Добавьте первый блок снизу.
            </p>
          ) : (
            blocks.map((block, i) => (
              <div
                key={i}
                className="bg-white border border-brand-border rounded-2xl p-4"
                data-block-card
                data-block-type={block.type}
              >
                <BlockToolbar
                  index={i}
                  total={blocks.length}
                  typeLabel={blockLabel(block.type)}
                  onMoveUp={() => move(i, -1)}
                  onMoveDown={() => move(i, 1)}
                  onRemove={() => remove(i)}
                />
                <BlockEditorForType
                  block={block}
                  onChange={(next) => replaceAt(i, next)}
                />
              </div>
            ))
          )}
        </div>
        <AddBlockMenu onAdd={add} />
      </div>

      {/* Preview column */}
      <BlockPreviewPane blocks={blocks} />
    </div>
  )
}

// Narrow to the right per-type editor. Using discriminated-union dispatch
// keeps each sub-editor strongly typed without casts.
function BlockEditorForType({
  block,
  onChange,
}: {
  block: Block
  onChange: (next: Block) => void
}) {
  switch (block.type) {
    case 'paragraph':
      return <ParagraphBlockEditor block={block} onChange={onChange} />
    case 'image':
      return <ImageBlockEditor block={block} onChange={onChange} />
    case 'gallery':
      return <GalleryBlockEditor block={block} onChange={onChange} />
    case 'layout':
      return <LayoutBlockEditor block={block} onChange={onChange} />
    case 'cta':
      return <CtaBlockEditor block={block} onChange={onChange} />
    case 'video':
      return <VideoBlockEditor block={block} onChange={onChange} />
    case 'faq':
      return <FaqBlockEditor block={block} onChange={onChange} />
    case 'product_grid':
      return <ProductGridBlockEditor block={block} onChange={onChange} />
  }
}
