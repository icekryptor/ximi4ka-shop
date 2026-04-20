'use client'

import type { GalleryBlock } from '@ximi4ka-shop/shared'
import { MultiImageUploadField } from '../ImageUploadField'

interface Props {
  block: GalleryBlock
  onChange: (next: GalleryBlock) => void
}

export function GalleryBlockEditor({ block, onChange }: Props) {
  return (
    <MultiImageUploadField
      value={block.images}
      onChange={(images) => onChange({ ...block, images })}
    />
  )
}
