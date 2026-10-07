'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { Product, SearchProductResult } from '@ximi4ka-shop/shared'
import { listProductsByCategory } from '@/lib/api'
import { formatRub } from '@/lib/stockLabel'
import { WHOLESALE_GROUPS } from '@/lib/wholesale'
import { wholesaleBadge } from '@/lib/wholesaleStaging'

// Категории, в которых у товаров есть оптовое правило (те же, что в
// WHOLESALE_CATEGORIES поиска: комбо и печать — без скидок).
const TABS = [
  { slug: 'kits', label: 'Наборы' },
  { slug: 'reagents', label: 'Реактивы' },
  { slug: 'equipment', label: 'Оборудование' },
] as const

type TabSlug = (typeof TABS)[number]['slug']

// Берём с запасом: оптовое правило проверяется на клиенте, и при малом лимите
// нужные товары могли остаться за пределами первой страницы категории.
const PAGE_LIMIT = 200
const CARD_GAP_PX = 12

const KIT_SLUGS: ReadonlySet<string> = new Set(WHOLESALE_GROUPS.flatMap((g) => g.slugs))

type TabState = { status: 'ready'; items: SearchProductResult[] } | { status: 'error' }

interface Props {
  onPick: (product: SearchProductResult) => void
  /** id товаров, которые уже в списке заказа: их кнопка неактивна. */
  stagedIds: ReadonlySet<string>
}

// Список категории отдаёт полный Product без слагов категорий. Категорию мы
// знаем по вкладке — её и кладём в SearchProductResult, как это делает поиск.
function toResult(p: Product, categorySlug: TabSlug): SearchProductResult {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    priceRub: p.priceRub,
    image: p.images[0]?.url ?? null,
    stockStatus: p.stockStatus,
    categories: [categorySlug],
  }
}

const ARROW_BTN =
  'inline-flex size-10 items-center justify-center rounded-full border-[0.5px] border-[var(--color-lj-ink)] font-lj-mono text-base leading-none text-[var(--color-lj-ink)] transition-colors hover:bg-[var(--color-lj-rule-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-lj-brand-deep)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent'

/**
 * Мини-каталог оптового блока: вкладки категорий и карусель из трёх карточек
 * (на телефоне — полторы, чтобы было видно, что лист листается). Свайп —
 * нативный (scroll-snap), стрелки — для мыши. «В заказ» кладёт товар в тот же
 * список, что и выбор из поиска.
 */
export function WholesaleCatalog({ onPick, stagedIds }: Props) {
  const baseId = useId()
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const trackRef = useRef<HTMLUListElement>(null)

  const [active, setActive] = useState<TabSlug>(TABS[0].slug)
  const [tabs, setTabs] = useState<Partial<Record<TabSlug, TabState>>>({})
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const state = tabs[active]

  // Нет записи — вкладка ещё грузится. Ошибка сбрасывает запись (кнопка
  // «Повторить»), и эффект стартует загрузку заново.
  useEffect(() => {
    if (state) return
    let cancelled = false
    listProductsByCategory(active, { limit: PAGE_LIMIT })
      .then((res) => {
        if (cancelled) return
        const items = res.data
          .map((p) => toResult(p, active))
          .filter((p) => wholesaleBadge(p.slug, p.categories) !== null)
          // Набор, который заодно лежит в реактивах, остаётся во вкладке «Наборы».
          .filter((p) => active === 'kits' || !KIT_SLUGS.has(p.slug))
        setTabs((cur) => ({ ...cur, [active]: { status: 'ready', items } }))
      })
      .catch(() => {
        if (!cancelled) setTabs((cur) => ({ ...cur, [active]: { status: 'error' } }))
      })
    return () => {
      cancelled = true
    }
  }, [active, state])

  const updateArrows = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setCanPrev(el.scrollLeft > 1)
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  // Состояние стрелок пересчитываем после отрисовки карточек и при ресайзе.
  // setState — только в колбэках, не прямо в теле эффекта.
  useEffect(() => {
    const frame = requestAnimationFrame(updateArrows)
    window.addEventListener('resize', updateArrows)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateArrows)
    }
  }, [state, active, updateArrows])

  const scrollByCard = (direction: 1 | -1) => {
    const el = trackRef.current
    if (!el) return
    const card = el.firstElementChild as HTMLElement | null
    const step = (card?.offsetWidth ?? 0) + CARD_GAP_PX
    el.scrollBy?.({ left: direction * step, behavior: 'smooth' })
  }

  const selectTab = (slug: TabSlug) => {
    setActive(slug)
    setCanPrev(false)
    setCanNext(false)
  }

  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next = -1
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    if (next < 0) return
    e.preventDefault()
    selectTab(TABS[next].slug)
    tabRefs.current[TABS[next].slug]?.focus()
  }

  const retry = () => setTabs((cur) => ({ ...cur, [active]: undefined }))

  const tabId = (slug: string) => `${baseId}-tab-${slug}`
  const panelId = `${baseId}-panel`
  const trackId = `${baseId}-track`

  const addToOrder = (p: SearchProductResult) => {
    onPick(p)
    setAnnouncement(`${p.name} добавлен в заказ`)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Категории каталога"
          className="flex min-w-0 gap-2 overflow-x-auto [scrollbar-width:none]"
        >
          {TABS.map((tab, i) => {
            const selected = tab.slug === active
            return (
              <button
                key={tab.slug}
                ref={(el) => {
                  tabRefs.current[tab.slug] = el
                }}
                type="button"
                role="tab"
                id={tabId(tab.slug)}
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(tab.slug)}
                onKeyDown={(e) => onTabKeyDown(e, i)}
                className={`shrink-0 rounded-full border px-3 py-2 sm:px-4 font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-lj-brand-deep)] ${
                  selected
                    ? 'border-[var(--color-lj-ink)] bg-[var(--color-lj-ink)] text-[var(--color-lj-cream)]'
                    : 'border-[var(--color-lj-rule)] hover:bg-[var(--color-lj-rule-soft)]'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
        <div className="hidden shrink-0 gap-2 sm:flex">
          <button
            type="button"
            className={ARROW_BTN}
            aria-label="Предыдущие товары"
            aria-controls={trackId}
            disabled={!canPrev}
            onClick={() => scrollByCard(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className={ARROW_BTN}
            aria-label="Следующие товары"
            aria-controls={trackId}
            disabled={!canNext}
            onClick={() => scrollByCard(1)}
          >
            ›
          </button>
        </div>
      </div>

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(active)}
        aria-busy={!state}
        className="min-h-[17rem] lg:min-h-[8rem]"
      >
        {!state ? (
          <div className="flex gap-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-40 basis-[72%] animate-pulse rounded-[var(--radius-lj-bright-sm)] bg-[var(--color-lj-rule-soft)] sm:basis-[calc((100%-1.5rem)/3)]"
              />
            ))}
          </div>
        ) : state.status === 'error' ? (
          <div className="flex flex-col items-start gap-3 py-6">
            <p className="font-lj-body text-sm">Не удалось загрузить каталог</p>
            <button
              type="button"
              className="lj-btn lj-btn-outline rounded-[4px] px-4 py-2"
              onClick={retry}
            >
              Повторить
            </button>
          </div>
        ) : state.items.length === 0 ? (
          <p className="py-6 font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.06em] opacity-65">
            В этой категории пока нет товаров
          </p>
        ) : (
          <div
            role="region"
            aria-roledescription="карусель"
            aria-label={`Товары: ${TABS.find((t) => t.slug === active)?.label}`}
          >
            <ul
              key={active}
              id={trackId}
              ref={trackRef}
              data-testid="wholesale-catalog-track"
              onScroll={updateArrows}
              className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none]"
            >
              {state.items.map((p) => {
                const soldOut = p.stockStatus === 'out_of_stock'
                const staged = stagedIds.has(p.id)
                return (
                  <li
                    key={p.id}
                    className="flex shrink-0 basis-[72%] snap-start flex-col gap-3 rounded-[var(--radius-lj-bright-sm)] border border-[var(--color-lj-rule)] bg-white p-3 sm:basis-[calc((100%-1.5rem)/3)] lg:flex-row"
                  >
                    <span className="flex aspect-[16/9] items-center justify-center overflow-hidden lg:aspect-square lg:size-24 lg:shrink-0 rounded-[var(--radius-lj-bright-sm)] bg-[var(--color-lj-cream)]">
                      {p.image ? (
                        // Plain <img>: картинки лежат на разных CDN, которых нет в белом
                        // списке next/image (то же решение, что в подсказках поиска).
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="font-lj-mono text-xs opacity-50">Х</span>
                      )}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="line-clamp-2 min-h-[2.5rem] font-lj-body leading-tight text-sm text-[var(--color-lj-ink)]">
                        {p.name}
                      </span>
                      <span className="min-h-[1rem] font-lj-mono text-[length:var(--text-lj-mono-xs)] text-[var(--color-lj-brand-deep)]">
                        {wholesaleBadge(p.slug, p.categories)}
                      </span>
                      <span className="font-lj-mono text-[length:var(--text-lj-mono-sm)]">
                        {formatRub(p.priceRub)}
                      </span>
                      <button
                        type="button"
                        // aria-disabled, а не disabled: после клика кнопка остаётся в
                        // порядке фокуса, и клавиатурный пользователь не теряет место.
                        disabled={soldOut}
                        aria-disabled={staged || undefined}
                        aria-label={
                          soldOut
                            ? `${p.name}: нет в наличии`
                            : `${p.name}: ${staged ? 'уже в заказе' : 'добавить в заказ'}`
                        }
                        onClick={() => {
                          if (!staged) addToOrder(p)
                        }}
                        className="lj-btn lj-btn-outline mt-auto rounded-[4px] px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-default aria-disabled:opacity-50"
                      >
                        {soldOut ? 'Нет в наличии' : staged ? 'В заказе' : 'В заказ'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}
