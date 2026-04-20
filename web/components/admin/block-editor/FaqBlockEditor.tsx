'use client'

import type { FaqBlock, FaqItem } from '@ximi4ka-shop/shared'
import { LabeledInput, LabeledTextarea } from '../FormFields'

interface Props {
  block: FaqBlock
  onChange: (next: FaqBlock) => void
}

export function FaqBlockEditor({ block, onChange }: Props) {
  const items = block.items

  function updateItem(i: number, patch: Partial<FaqItem>) {
    const next = items.map((item, idx) => (idx === i ? { ...item, ...patch } : item))
    onChange({ ...block, items: next })
  }

  function removeItem(i: number) {
    onChange({ ...block, items: items.filter((_, idx) => idx !== i) })
  }

  function addItem() {
    onChange({ ...block, items: [...items, { question: '', answer: '' }] })
  }

  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div
          key={i}
          className="border border-brand-border rounded-lg p-3 space-y-2 bg-brand-bg-soft/50"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-brand-text">
              Вопрос {i + 1}
            </span>
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="text-sm text-red-600 hover:underline"
            >
              Удалить
            </button>
          </div>
          <LabeledInput
            label="Вопрос"
            value={item.question}
            onChange={(question) => updateItem(i, { question })}
          />
          <LabeledTextarea
            label="Ответ"
            value={item.answer}
            onChange={(answer) => updateItem(i, { answer })}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="px-3 py-2 rounded-lg bg-white text-brand-text hover:bg-brand-bg-soft border border-brand-border text-sm"
      >
        + Добавить вопрос
      </button>
    </div>
  )
}
