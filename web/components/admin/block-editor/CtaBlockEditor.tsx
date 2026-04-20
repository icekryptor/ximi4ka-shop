'use client'

import type { CtaBlock } from '@ximi4ka-shop/shared'
import { LabeledInput, LabeledTextarea } from '../FormFields'

interface Props {
  block: CtaBlock
  onChange: (next: CtaBlock) => void
}

export function CtaBlockEditor({ block, onChange }: Props) {
  return (
    <div className="space-y-3">
      <LabeledInput
        label="Заголовок"
        value={block.heading}
        onChange={(heading) => onChange({ ...block, heading })}
      />
      <LabeledTextarea
        label="Подтекст"
        value={block.subtext ?? ''}
        onChange={(subtext) =>
          onChange({ ...block, subtext: subtext || null })
        }
      />
      <LabeledInput
        label="Текст кнопки"
        value={block.buttonLabel}
        onChange={(buttonLabel) => onChange({ ...block, buttonLabel })}
      />
      <LabeledInput
        label="Ссылка кнопки"
        value={block.buttonHref}
        onChange={(buttonHref) => onChange({ ...block, buttonHref })}
        placeholder="/category/slug или https://..."
      />
    </div>
  )
}
