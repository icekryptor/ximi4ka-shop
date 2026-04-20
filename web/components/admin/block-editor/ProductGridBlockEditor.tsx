'use client'

import { useState } from 'react'
import type { ProductGridBlock } from '@ximi4ka-shop/shared'
import { LabeledInput } from '../FormFields'

interface Props {
  block: ProductGridBlock
  onChange: (next: ProductGridBlock) => void
}

export function ProductGridBlockEditor({ block, onChange }: Props) {
  const joined = block.productSlugs.join(', ')
  // Remount the raw editor whenever the canonical slug list changes
  // externally (undo, reset, etc.). This is cleaner than a
  // setState-in-effect sync and matches React's recommended pattern.
  return (
    <RawSlugsEditor key={joined} block={block} initialRaw={joined} onChange={onChange} />
  )
}

function RawSlugsEditor({
  block,
  initialRaw,
  onChange,
}: {
  block: ProductGridBlock
  initialRaw: string
  onChange: (next: ProductGridBlock) => void
}) {
  const [raw, setRaw] = useState(initialRaw)

  function commitRaw() {
    const slugs = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    // Don't fire a no-op onChange if nothing actually changed.
    if (slugs.join(',') === block.productSlugs.join(',')) return
    onChange({ ...block, productSlugs: slugs })
  }

  return (
    <div className="space-y-3">
      <LabeledInput
        label="Заголовок"
        value={block.heading ?? ''}
        onChange={(heading) =>
          onChange({ ...block, heading: heading || null })
        }
      />
      <label className="block">
        <span className="block text-sm font-medium text-brand-text-secondary mb-1">
          Slugs товаров (через запятую)
        </span>
        <input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={commitRaw}
          className="w-full px-3 py-2 rounded-lg border border-brand-border bg-white font-mono text-xs focus:outline-none focus:border-brand"
        />
      </label>
      <p className="text-xs text-brand-text-secondary">
        Пример: <code>nabor-yunogo-himika, vulkan-lavy</code>. Несуществующие
        slug будут пропущены при рендере.
      </p>
    </div>
  )
}
