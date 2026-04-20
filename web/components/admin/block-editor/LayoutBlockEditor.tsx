'use client'

import type { LayoutBlock, LayoutVariant } from '@ximi4ka-shop/shared'
import { ImageUploadField } from '../ImageUploadField'
import { RichTextEditor } from '../RichTextEditor'
import { LabeledInput } from '../FormFields'

interface Props {
  block: LayoutBlock
  onChange: (next: LayoutBlock) => void
}

export function LayoutBlockEditor({ block, onChange }: Props) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="block text-sm font-medium text-brand-text-secondary mb-1">
          Вариант
        </span>
        <select
          value={block.variant}
          onChange={(e) =>
            onChange({ ...block, variant: e.target.value as LayoutVariant })
          }
          className="w-full px-3 py-2 rounded-lg border border-brand-border bg-white focus:outline-none focus:border-brand text-sm"
        >
          <option value="text-left">Текст слева, картинка справа</option>
          <option value="text-right">Картинка слева, текст справа</option>
          <option value="text-top">Текст сверху, картинка снизу</option>
          <option value="text-bottom">Картинка сверху, текст снизу</option>
          <option value="overlay">Текст поверх картинки</option>
        </select>
      </label>
      <ImageUploadField
        value={block.image.url || null}
        onChange={(url) =>
          onChange({ ...block, image: { ...block.image, url: url ?? '' } })
        }
      />
      <LabeledInput
        label="Alt-текст картинки"
        value={block.image.alt}
        onChange={(alt) =>
          onChange({ ...block, image: { ...block.image, alt } })
        }
      />
      <div>
        <span className="block text-sm font-medium text-brand-text-secondary mb-1">
          Текст
        </span>
        <RichTextEditor
          value={block.text.html}
          onChange={(html) => onChange({ ...block, text: { html } })}
        />
      </div>
    </div>
  )
}
