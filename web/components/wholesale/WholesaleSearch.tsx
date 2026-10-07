'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { SearchProductResult } from '@ximi4ka-shop/shared'
import { searchCatalog } from '@/lib/api'
import { formatRub } from '@/lib/stockLabel'
import { wholesaleBadge } from '@/lib/wholesaleStaging'

const DEBOUNCE_MS = 250
const MIN_QUERY = 2

interface Props {
  onPick: (product: SearchProductResult) => void
}

/**
 * Поле поиска оптового блока: подсказки с карточками товаров (фото, цена,
 * короткое описание скидки). Запросы — с scope=wholesale, поэтому в выдаче
 * только товары, у которых есть оптовое правило. Устроено как HeaderSearch.
 */
export function WholesaleSearch({ onPick }: Props) {
  const listboxId = useId()
  const optionIdBase = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<SearchProductResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const hasQuery = query.trim().length >= MIN_QUERY

  // Дебаунс и отмена: устаревший ответ не перезапишет свежий. loading и сброс
  // короткого запроса ставятся в onChange — setState прямо в эффекте даёт каскад.
  useEffect(() => {
    if (!hasQuery) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchCatalog(query.trim(), { scope: 'wholesale', signal: controller.signal })
        .then((res) => {
          setProducts(res.products)
          setActiveIndex(-1)
        })
        .catch((err: unknown) => {
          if ((err as { name?: string })?.name !== 'AbortError') setProducts([])
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, hasQuery])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const showList = open && hasQuery
  const showEmpty = showList && !loading && products.length === 0

  const choose = (product: SearchProductResult) => {
    if (product.stockStatus === 'out_of_stock') return
    onPick(product)
    setQuery('')
    setProducts([])
    setOpen(false)
    setActiveIndex(-1)
    // Следующий поиск можно начинать сразу, без клика в поле.
    inputRef.current?.focus()
  }

  const onChange = (value: string) => {
    setQuery(value)
    setOpen(true)
    const long = value.trim().length >= MIN_QUERY
    setLoading(long)
    if (!long) setProducts([])
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (!showList || products.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % products.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? products.length - 1 : i - 1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      choose(products[activeIndex])
    }
  }

  const optionId = (i: number) => `${optionIdBase}-opt-${i}`

  return (
    <div ref={rootRef} className="relative w-full">
      <div
        role="combobox"
        aria-expanded={showList}
        aria-haspopup="listbox"
        aria-owns={listboxId}
        aria-controls={listboxId}
      >
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Начните вводить название: набор, реактив, пробирка…"
          aria-label="Найти товар для оптового заказа"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          className="w-full rounded-full border border-[var(--color-lj-rule)] bg-[var(--color-lj-cream)] px-5 py-3.5 font-lj-body text-base text-[var(--color-lj-ink)] outline-none transition-colors placeholder:opacity-55 focus:border-[var(--color-lj-brand)]"
        />
      </div>
      {loading && hasQuery ? (
        <span role="status" aria-label="Загрузка" className="sr-only">
          Загрузка
        </span>
      ) : null}

      {showList ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Результаты поиска"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[60] max-h-[70vh] overflow-y-auto rounded-[var(--radius-lj-bright-sm)] border border-[var(--color-lj-rule)] bg-[var(--color-lj-cream)] p-1 shadow-[var(--shadow-lj-bright)]"
        >
          {showEmpty ? (
            <li
              role="presentation"
              className="px-3 py-4 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-65"
            >
              Ничего не найдено
            </li>
          ) : (
            products.map((p, i) => {
              const soldOut = p.stockStatus === 'out_of_stock'
              const badge = wholesaleBadge(p.slug, p.categories)
              return (
                <li key={p.id} role="presentation">
                  <button
                    type="button"
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === activeIndex}
                    aria-disabled={soldOut}
                    onClick={() => choose(p)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`flex w-full items-center gap-3 rounded-[var(--radius-lj-bright-sm)] px-2.5 py-2 text-left transition-colors ${
                      i === activeIndex ? 'bg-[var(--color-lj-cream-shade)]' : ''
                    } ${soldOut ? 'cursor-not-allowed opacity-50' : 'hover:bg-[var(--color-lj-cream-shade)]'}`}
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-lj-bright-sm)] border border-[var(--color-lj-rule)] bg-white">
                      {p.image ? (
                        // Plain <img>: миниатюры лежат на разных CDN, которых нет в
                        // белом списке next/image; 48px-превью не нужен конвейер оптимизации.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] opacity-50">
                          Х
                        </span>
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-lj-body text-sm text-[var(--color-lj-ink)]">
                        {p.name}
                      </span>
                      <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] text-[var(--color-lj-brand-deep)]">
                        {soldOut ? 'Нет в наличии' : badge}
                      </span>
                    </span>
                    <span className="shrink-0 font-lj-mono text-[length:var(--text-lj-mono-sm)]">
                      {formatRub(p.priceRub)}
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      ) : null}
    </div>
  )
}
