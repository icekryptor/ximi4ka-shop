'use client'

import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'

interface Props {
  blocks: unknown[]
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ProductGridBlock — async-серверный компонент, а предпросмотр клиентский:
// React на клиенте не умеет его ждать, и блок навсегда застревает на
// «Загрузка товаров...». Поэтому в предпросмотре подборка заменяется заметкой
// со slug'ами; реальные карточки рендерит витрина.
function previewBlock(block: unknown): unknown {
  if (!isBlock(block) || block.type !== 'product_grid') return block
  const heading = block.heading ? `«${block.heading}»: ` : ''
  const slugs = block.productSlugs.join(', ') || 'товары не выбраны'
  return {
    type: 'paragraph',
    html: `<p><em>${escapeHtml(`Подборка товаров (карточки видны на витрине) — ${heading}${slugs}`)}</em></p>`,
  }
}

// Wraps the public BlockRenderer so the admin preview is guaranteed to
// match the storefront pixel-for-pixel. Do not fork the renderer.
export function BlockPreviewPane({ blocks }: Props) {
  return (
    <div className="lg:sticky lg:top-6 lg:self-start">
      <h3 className="text-sm font-semibold text-brand-text-secondary mb-2">Предпросмотр</h3>
      <div
        className="border border-brand-border rounded-lg p-4 bg-white overflow-auto max-h-[80vh]"
        data-testid="block-preview"
      >
        {blocks.length === 0 ? (
          <p className="text-sm text-brand-text-secondary italic">
            Добавьте блок, чтобы увидеть предпросмотр.
          </p>
        ) : (
          <BlockRenderer blocks={blocks.map(previewBlock)} />
        )}
      </div>
    </div>
  )
}
