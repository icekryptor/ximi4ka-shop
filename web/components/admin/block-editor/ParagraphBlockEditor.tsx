'use client'

import type { ParagraphBlock } from '@ximi4ka-shop/shared'
import { RichTextEditor } from '../RichTextEditor'

interface Props {
  block: ParagraphBlock
  onChange: (next: ParagraphBlock) => void
}

export function ParagraphBlockEditor({ block, onChange }: Props) {
  return (
    <RichTextEditor
      value={block.html}
      onChange={(html) => onChange({ ...block, html })}
    />
  )
}
