'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { SearchResult } from '@ximi4ka-shop/shared'
import { searchCatalog } from '@/lib/api'
import { formatRub } from '@/lib/stockLabel'

const DEBOUNCE_MS = 250
const MIN_QUERY = 2

type FlatItem =
  | { kind: 'product'; slug: string; name: string; priceRub: number; image: string | null }
  | { kind: 'post'; slug: string; title: string }

function flatten(result: SearchResult): FlatItem[] {
  return [
    ...result.products.map((p) => ({ kind: 'product' as const, ...p })),
    ...result.posts.map((p) => ({ kind: 'post' as const, ...p })),
  ]
}

function hrefFor(item: FlatItem): string {
  return item.kind === 'product' ? `/product/${item.slug}` : `/blog/${item.slug}`
}

export function HeaderSearch() {
  const router = useRouter()
  const listboxId = useId()
  const optionIdBase = useId()

  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo(() => (result ? flatten(result) : []), [result])
  const hasQuery = query.trim().length >= MIN_QUERY

  // Debounced fetch. A stale request is aborted when the query changes so
  // out-of-order responses can never overwrite fresher results.
  useEffect(() => {
    if (!hasQuery) {
      setResult(null)
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    const timer = setTimeout(() => {
      searchCatalog(query.trim(), { signal: controller.signal })
        .then((res) => {
          setResult(res)
          setActiveIndex(-1)
        })
        .catch((err: unknown) => {
          if ((err as { name?: string })?.name !== 'AbortError') setResult({ products: [], posts: [] })
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

  // Close the preview when focus leaves the whole widget (click outside).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const goTo = useCallback(
    (item: FlatItem) => {
      setOpen(false)
      setActiveIndex(-1)
      router.push(hrefFor(item))
    },
    [router],
  )

  const showPreview = open && hasQuery
  const showEmpty = showPreview && !loading && items.length === 0

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (!showPreview || items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < items.length) {
        e.preventDefault()
        goTo(items[activeIndex])
      }
    }
  }

  const optionId = (i: number) => `${optionIdBase}-opt-${i}`

  return (
    <div ref={rootRef} className="relative w-full max-w-[22rem]">
      <div
        role="combobox"
        aria-expanded={showPreview}
        aria-owns={listboxId}
        aria-haspopup="listbox"
        className="relative"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-lj-ink)] opacity-55"
        >
          {/* Лупа */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="7" cy="7" r="4.5" />
            <line x1="10.5" y1="10.5" x2="14" y2="14" strokeLinecap="round" />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="search"
          role="searchbox"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Поиск по каталогу…"
          aria-label="Поиск по каталогу"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={
            showPreview && activeIndex >= 0 ? optionId(activeIndex) : undefined
          }
          autoComplete="off"
          className="w-full rounded-full border border-[var(--color-lj-rule)] bg-[var(--color-lj-cream)] py-2 pl-9 pr-3 font-lj-body text-sm text-[var(--color-lj-ink)] outline-none transition-colors placeholder:opacity-55 focus:border-[var(--color-lj-brand)]"
        />
        {loading && hasQuery ? (
          <span
            role="status"
            aria-label="Загрузка"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="var(--color-lj-brand)"
              strokeWidth="1.8"
              className="motion-safe:animate-spin"
              aria-hidden="true"
            >
              <path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5" strokeLinecap="round" />
            </svg>
          </span>
        ) : null}
      </div>

      {showPreview ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Результаты поиска"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[60] max-h-[70vh] overflow-y-auto rounded-[var(--radius-lj-bright-sm)] border border-[var(--color-lj-rule)] bg-[var(--color-lj-cream)] p-1 shadow-[var(--shadow-lj-bright)]"
        >
          {showEmpty ? (
            <li
              role="option"
              aria-disabled="true"
              aria-selected="false"
              className="px-3 py-4 font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-65"
            >
              Ничего не найдено
            </li>
          ) : (
            items.map((item, i) => {
              const active = i === activeIndex
              const optClass = `flex items-center gap-3 rounded-[var(--radius-lj-bright-sm)] px-2.5 py-2 no-underline transition-colors ${
                active ? 'bg-[var(--color-lj-cream-shade)]' : 'hover:bg-[var(--color-lj-cream-shade)]'
              }`
              return (
                <li key={`${item.kind}-${item.slug}`} role="presentation">
                  <Link
                    id={optionId(i)}
                    role="option"
                    aria-selected={active}
                    href={hrefFor(item)}
                    onClick={() => {
                      setOpen(false)
                      setActiveIndex(-1)
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={optClass}
                  >
                    {item.kind === 'product' ? (
                      <>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-lj-bright-sm)] border border-[var(--color-lj-rule)] bg-white">
                          {item.image ? (
                            // Plain <img>: thumbnails come from arbitrary CDNs not
                            // whitelisted in next/image; a tiny 40px preview needs no
                            // optimization pipeline.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.image} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] opacity-50">
                              Х
                            </span>
                          )}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-lj-body text-sm text-[var(--color-lj-ink)]">
                            {item.name}
                          </span>
                          <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] text-[var(--color-lj-brand)]">
                            {formatRub(item.priceRub)}
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lj-bright-sm)] border border-[var(--color-lj-rule)] font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase text-[var(--color-lj-ink)] opacity-60">
                          ст
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-lj-body text-sm text-[var(--color-lj-ink)]">
                            {item.title}
                          </span>
                          <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] text-[var(--color-lj-ink)] opacity-55">
                            Блог
                          </span>
                        </span>
                      </>
                    )}
                  </Link>
                </li>
              )
            })
          )}
        </ul>
      ) : null}
    </div>
  )
}
