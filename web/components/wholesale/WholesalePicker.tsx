'use client'

import { useId, useRef, useState, type KeyboardEvent } from 'react'
import Image from 'next/image'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import type { SearchProductResult } from '@ximi4ka-shop/shared'
import { formatRub } from '@/lib/stockLabel'
import { wholesaleFromPrice } from '@/lib/wholesaleStaging'
import { useCarousel } from './useCarousel'
import { useWholesaleCatalog } from './useWholesaleCatalog'

/** Сколько карточек видно одновременно, на любой ширине. */
const VISIBLE = 3

// Три карточки и два промежутка по 0.75rem (gap-3) занимают ровно ширину ряда.
const CARD_BASIS = 'basis-[calc((100%-1.5rem)/3)]'

const TAB_BASE =
  'inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full border px-4 font-lj-mazzard text-[0.8125rem] font-medium leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-lj-brand-deep)]'
const ARROW_BTN =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-lj-rule)] text-[var(--color-lj-ink)] transition-colors hover:bg-[var(--color-lj-rule-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-lj-brand-deep)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent'
const MONO_XS = 'font-lj-mono text-[length:var(--text-lj-mono-xs)]'

interface Props {
  /** Товары, уже лежащие в списке заказа (по id). */
  addedIds: ReadonlySet<string>
  /** Тот же обработчик, что у подсказок поиска. */
  onPick: (product: SearchProductResult) => void
}

/**
 * Второй способ выбрать позицию оптового заказа: вкладки категорий со скидкой
 * и карусель из трёх мини-карточек. Прокрутка — CSS scroll-snap (свайп пальцем
 * нативный, по одной карточке благодаря scroll-snap-stop), кнопки и перетаскивание
 * мышью сдвигают `scrollBy` на ширину одной карточки.
 */
export function WholesalePicker({ addedIds, onPick }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const { tabs, active, select, state, retry } = useWholesaleCatalog(rootRef)
  const baseId = useId()
  const panelId = `${baseId}-panel`
  const tabId = (slug: string) => `${baseId}-tab-${slug}`
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const [announced, setAnnounced] = useState('')

  const items = state?.status === 'ready' ? state.items : []
  const [track, setTrack] = useState<HTMLUListElement | null>(null)
  const {
    atStart,
    atEnd,
    prevRef,
    nextRef,
    update,
    step,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
  } = useCarousel(track)
  const showArrows = items.length > VISIBLE
  const activeTab = tabs.find((t) => t.slug === active)

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1
    const target =
      e.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1
    if (target < 0) return
    e.preventDefault()
    const slug = tabs[target].slug
    select(slug)
    tabRefs.current.get(slug)?.focus()
  }

  const add = (item: SearchProductResult) => {
    if (!addedIds.has(item.id)) setAnnounced(item.name)
    onPick(item)
  }

  if (tabs.length === 0 || !active || !activeTab) return null

  return (
    <div ref={rootRef} className="flex max-w-[36rem] flex-col gap-3">
      <p className={`${MONO_XS} uppercase tracking-[0.06em] opacity-65`}>
        Или выберите из каталога
      </p>

      <div className="flex items-start justify-between gap-3">
        <div role="tablist" aria-label="Категории товаров" className="flex min-w-0 flex-wrap gap-2">
          {tabs.map((tab, i) => {
            const selected = tab.slug === active
            return (
              <button
                key={tab.slug}
                ref={(el) => {
                  if (el) tabRefs.current.set(tab.slug, el)
                  else tabRefs.current.delete(tab.slug)
                }}
                type="button"
                role="tab"
                id={tabId(tab.slug)}
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(tab.slug)}
                onKeyDown={(e) => onTabKeyDown(e, i)}
                className={`${TAB_BASE} ${
                  selected
                    ? 'border-[var(--color-lj-ink)] bg-[var(--color-lj-ink)] text-[var(--color-lj-cream)]'
                    : 'border-[var(--color-lj-rule)] text-[var(--color-lj-ink)] hover:bg-[var(--color-lj-rule-soft)]'
                }`}
              >
                {tab.name}
              </button>
            )
          })}
        </div>

        {showArrows ? (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              aria-label="Назад"
              disabled={atStart}
              onClick={() => step(-1)}
              ref={prevRef}
              className={ARROW_BTN}
            >
              <ChevronLeft aria-hidden="true" size={18} />
            </button>
            <button
              type="button"
              aria-label="Вперёд"
              disabled={atEnd}
              onClick={() => step(1)}
              ref={nextRef}
              className={ARROW_BTN}
            >
              <ChevronRight aria-hidden="true" size={18} />
            </button>
          </div>
        ) : null}
      </div>

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(active)}
        // Смена вкладки — новая дорожка: прокрутка начинается с первой карточки.
        key={active}
      >
        <div role="group" aria-roledescription="карусель" aria-label={`${activeTab.name}: товары`}>
          {state === null ? (
            <PickerSkeleton />
          ) : state.status === 'error' ? (
            <PickerMessage role="alert" onRetry={() => retry(active)}>
              Не удалось загрузить
            </PickerMessage>
          ) : items.length === 0 ? (
            <PickerMessage>Здесь пока нет товаров</PickerMessage>
          ) : (
            <ul
              ref={setTrack}
              data-testid="wholesale-picker-track"
              data-visible={VISIBLE}
              onScroll={update}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onClickCapture={onClickCapture}
              className="m-0 flex select-none list-none snap-x snap-mandatory gap-3 touch-pan-y overflow-x-auto overscroll-x-contain p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`${CARD_BASIS} min-w-0 shrink-0 grow-0 snap-start [scroll-snap-stop:always]`}
                >
                  <MiniCard item={item} added={addedIds.has(item.id)} onAdd={add} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <span role="status" aria-label="Добавлено в список" className="sr-only">
        {announced}
      </span>
    </div>
  )
}

function MiniCard({
  item,
  added,
  onAdd,
}: {
  item: SearchProductResult
  added: boolean
  onAdd: (item: SearchProductResult) => void
}) {
  const soldOut = item.stockStatus === 'out_of_stock'
  const from = wholesaleFromPrice(item.slug, item.categories, item.priceRub)

  return (
    <article className="flex h-full flex-col gap-2 text-xs sm:text-[0.8125rem]">
      <div className="relative aspect-square overflow-hidden rounded-[var(--radius-lj-bright-sm)] border border-[var(--color-lj-rule)] bg-white">
        {item.image ? (
          <Image
            src={item.image}
            alt=""
            fill
            sizes="(max-width: 640px) 30vw, 176px"
            loading="lazy"
            draggable={false}
            className={`object-cover ${soldOut ? 'opacity-50' : ''}`}
          />
        ) : (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center font-lj-mono text-xs opacity-50"
          >
            Х
          </span>
        )}
      </div>

      <h3 className="min-h-[2.5em] font-lj-mazzard font-normal leading-[1.25] line-clamp-2 hyphens-auto [overflow-wrap:anywhere]">
        {item.name}
      </h3>

      <div className="flex min-h-9 flex-col justify-start gap-1">
        <span className="font-lj-mazzard text-[0.9375rem] leading-none tracking-[-0.02em]">
          {formatRub(item.priceRub)}
        </span>
        {soldOut ? (
          <span className={`${MONO_XS} leading-[1.2] opacity-60`}>Нет в наличии</span>
        ) : from ? (
          <span className={`${MONO_XS} leading-[1.2] text-[var(--color-lj-brand-deep)]`}>
            от {formatRub(from.unitRub)}/шт
            <span className="sr-only"> при заказе от {from.minQty} шт</span>
          </span>
        ) : null}
      </div>

      <button
        type="button"
        disabled={soldOut}
        aria-disabled={added || undefined}
        onClick={() => onAdd(item)}
        className={`lj-btn mt-auto h-9 w-full gap-1.5 px-1.5 py-0 text-xs focus-visible:outline-offset-[-2px] ${
          added
            ? 'bg-[var(--color-lj-cream-shade)] text-[var(--color-lj-brand-deep)]'
            : 'lj-btn-outline'
        }`}
      >
        {added ? <Check aria-hidden="true" size={14} /> : null}
        {added ? 'В списке' : 'В список'}
      </button>
    </article>
  )
}

/** Три карточки-заглушки той же высоты: раскладка не прыгает, когда придут данные. */
function PickerSkeleton() {
  return (
    <div className="flex gap-3" aria-busy="true">
      <span role="status" aria-label="Загрузка" className="sr-only">
        Загрузка
      </span>
      {Array.from({ length: VISIBLE }, (_, i) => (
        <div
          key={i}
          data-testid="wholesale-picker-skeleton"
          aria-hidden="true"
          className={`${CARD_BASIS} flex min-w-0 shrink-0 grow-0 flex-col gap-2 text-xs motion-safe:animate-pulse sm:text-[0.8125rem]`}
        >
          <div className="aspect-square rounded-[var(--radius-lj-bright-sm)] bg-[var(--color-lj-rule-soft)]" />
          <div className="flex min-h-[2.5em] flex-col justify-start gap-1.5 pt-0.5">
            <span className="h-2.5 w-full rounded-full bg-[var(--color-lj-rule-soft)]" />
            <span className="h-2.5 w-2/3 rounded-full bg-[var(--color-lj-rule-soft)]" />
          </div>
          <div className="flex min-h-9 flex-col gap-1.5">
            <span className="h-3 w-1/2 rounded-full bg-[var(--color-lj-rule-soft)]" />
            <span className="h-2.5 w-3/4 rounded-full bg-[var(--color-lj-rule-soft)]" />
          </div>
          <div className="h-9 rounded-[5px] bg-[var(--color-lj-rule-soft)]" />
        </div>
      ))}
    </div>
  )
}

/**
 * Сообщение вместо карточек. Под ним невидимый скелетон: он держит ту же
 * высоту, и при ошибке или пустой категории блок не схлопывается.
 */
function PickerMessage({
  children,
  role,
  onRetry,
}: {
  children: string
  role?: 'alert'
  onRetry?: () => void
}) {
  return (
    <div className="relative">
      <div className="invisible" aria-hidden="true">
        <PickerSkeletonShape />
      </div>
      <div
        role={role}
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lj-bright-sm)] border border-dashed border-[var(--color-lj-rule)] px-4 text-center"
      >
        <p className="font-lj-body text-sm opacity-75">{children}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="lj-btn lj-btn-outline rounded-[4px] px-4 py-2"
          >
            Повторить
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** Те же размеры, что у скелетона, но без статуса «Загрузка» и анимации. */
function PickerSkeletonShape() {
  return (
    <div className="flex gap-3">
      {Array.from({ length: VISIBLE }, (_, i) => (
        <div
          key={i}
          className={`${CARD_BASIS} flex min-w-0 shrink-0 grow-0 flex-col gap-2 text-xs sm:text-[0.8125rem]`}
        >
          <div className="aspect-square" />
          <div className="min-h-[2.5em]" />
          <div className="min-h-9" />
          <div className="h-9" />
        </div>
      ))}
    </div>
  )
}
