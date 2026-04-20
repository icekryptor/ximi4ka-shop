'use client'

import { BlockRenderer } from '@/components/blocks/BlockRenderer'

interface Props {
  blocks: unknown[]
}

// Wraps the public BlockRenderer so the admin preview is guaranteed to
// match the storefront pixel-for-pixel. Do not fork the renderer.
export function BlockPreviewPane({ blocks }: Props) {
  return (
    <div className="lg:sticky lg:top-6 lg:self-start">
      <h3 className="text-sm font-semibold text-brand-text-secondary mb-2">
        Предпросмотр
      </h3>
      <div
        className="border border-brand-border rounded-lg p-4 bg-white overflow-auto max-h-[80vh]"
        data-testid="block-preview"
      >
        {blocks.length === 0 ? (
          <p className="text-sm text-brand-text-secondary italic">
            Добавьте блок, чтобы увидеть предпросмотр.
          </p>
        ) : (
          <BlockRenderer blocks={blocks} />
        )}
      </div>
    </div>
  )
}
