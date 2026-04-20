'use client'

interface Props {
  index: number
  total: number
  typeLabel: string
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}

export function BlockToolbar({
  index,
  total,
  typeLabel,
  onMoveUp,
  onMoveDown,
  onRemove,
}: Props) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <span className="text-xs font-semibold text-brand-text-secondary uppercase tracking-wide">
        {typeLabel}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Переместить вверх"
          title="Переместить вверх"
          onClick={onMoveUp}
          disabled={index === 0}
          className="px-2 py-1 rounded bg-white border border-brand-border text-brand-text hover:bg-brand-bg-soft disabled:opacity-40 disabled:cursor-not-allowed text-sm"
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="Переместить вниз"
          title="Переместить вниз"
          onClick={onMoveDown}
          disabled={index >= total - 1}
          className="px-2 py-1 rounded bg-white border border-brand-border text-brand-text hover:bg-brand-bg-soft disabled:opacity-40 disabled:cursor-not-allowed text-sm"
        >
          ↓
        </button>
        <button
          type="button"
          aria-label="Удалить блок"
          title="Удалить блок"
          onClick={onRemove}
          className="px-2 py-1 rounded bg-white border border-brand-border text-red-600 hover:bg-red-50 text-sm"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
