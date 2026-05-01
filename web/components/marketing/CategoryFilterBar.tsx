'use client'

type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'name-asc'

const SORT_LABELS: Record<SortKey, string> = {
  'newest': 'Новинки',
  'price-asc': 'Цена ↑',
  'price-desc': 'Цена ↓',
  'name-asc': 'А–Я',
}

interface Props {
  sort: SortKey
  onSortChange: (s: SortKey) => void
  onReset: () => void
}

export function CategoryFilterBar({ sort, onSortChange, onReset }: Props) {
  return (
    <div className="sticky top-20 z-20 bg-[var(--color-lj-cream)]/95 backdrop-blur-sm border-y border-[var(--color-lj-rule)] py-3 px-6">
      <div className="max-w-[var(--max-lj-content)] mx-auto flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-70 mr-2">
            сортировка:
          </span>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onSortChange(key)}
              className={`px-3 py-1.5 border rounded-full font-[var(--font-lj-mono)] text-[0.6875rem] uppercase tracking-[0.04em] transition-colors duration-300 ${
                sort === key
                  ? 'bg-[var(--color-lj-ink)] border-[var(--color-lj-ink)] text-[var(--color-lj-bone)]'
                  : 'border-[var(--color-lj-ink)] bg-transparent text-[var(--color-lj-ink)] hover:bg-[var(--color-lj-ink)] hover:text-[var(--color-lj-bone)]'
              }`}
              aria-label={`Сортировка: ${SORT_LABELS[key]}`}
            >
              {SORT_LABELS[key]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onReset}
          className="font-[var(--font-lj-mono)] text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] underline underline-offset-4 hover:text-[var(--color-lj-brand-deep)]"
          aria-label="Сбросить сортировку"
        >
          Сбросить ×
        </button>
      </div>
    </div>
  )
}

export type { SortKey }
