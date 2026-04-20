'use client'

import type { ImageBlock } from '@ximi4ka-shop/shared'
import { ImageUploadField } from '../ImageUploadField'
import { LabeledInput } from '../FormFields'

interface Props {
  block: ImageBlock
  onChange: (next: ImageBlock) => void
}

export function ImageBlockEditor({ block, onChange }: Props) {
  return (
    <div className="space-y-3">
      <ImageUploadField
        value={block.url || null}
        onChange={(url) => onChange({ ...block, url: url ?? '' })}
      />
      <LabeledInput
        label="Alt-текст"
        value={block.alt}
        onChange={(alt) => onChange({ ...block, alt })}
      />
      <LabeledInput
        label="Подпись"
        value={block.caption ?? ''}
        onChange={(caption) =>
          onChange({ ...block, caption: caption || null })
        }
      />
    </div>
  )
}
