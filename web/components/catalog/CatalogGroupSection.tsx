'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'

export type CatalogGridLayout = 'kit' | 'compact'

interface Props {
  headingId: string
  title: string
  /** «Вся категория →». */
  href: string
  /** Сетка по умолчанию: 'kit' — 4 колонки, 'compact' — 6 колонок. */
  layout: CatalogGridLayout
  /** Переключатель «крупные / компактные карточки» в строке заголовка. */
  toggleable?: boolean
  /** Карточки товаров — рендерятся на сервере, здесь меняется только сетка. */
  children: ReactNode
}

// Сетки из макета «Каталог — 1440»: наборы — 4 × 324 с зазором 32,
// реактивы и оборудование — 6 × 215 с зазором 20 и 32 между рядами.
const GRID: Record<CatalogGridLayout, string> = {
  kit: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8',
  compact: 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-5 gap-y-8',
}

/**
 * Секция каталога: заголовок категории (Mazzard Light Italic, линия снизу),
 * ссылка на категорию и сетка карточек. Для длинных групп (реактивы) в строке
 * заголовка — переключатель плотности из макета: две крупные карточки или
 * компактные ряды. Активная кнопка — фиолетовая.
 */
export function CatalogGroupSection({
  headingId,
  title,
  href,
  layout,
  toggleable = false,
  children,
}: Props) {
  const [current, setCurrent] = useState<CatalogGridLayout>(layout)

  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-center justify-between gap-x-4 gap-y-3 flex-wrap mb-8 border-b border-[var(--color-lj-rule)] pb-4">
        <h2
          id={headingId}
          className="font-lj-mazzard font-light italic text-[clamp(2rem,3vw,2.7rem)] leading-[0.95]"
        >
          {title}
        </h2>
        <div className="flex items-center gap-[22px]">
          <Link
            href={href}
            className="font-lj-mono text-[length:var(--text-lj-mono-sm)] uppercase tracking-[0.03em] opacity-70 hover:opacity-100 hover:text-[var(--color-lj-brand-deep)] transition-opacity"
          >
            Вся категория →
          </Link>
          {toggleable ? (
            <div role="group" aria-label="Вид карточек" className="flex gap-[5px]">
              <ViewButton
                label="Крупные карточки"
                pressed={current === 'kit'}
                onClick={() => setCurrent('kit')}
              >
                <LargeCardsIcon />
              </ViewButton>
              <ViewButton
                label="Компактные карточки"
                pressed={current === 'compact'}
                onClick={() => setCurrent('compact')}
              >
                <CompactCardsIcon />
              </ViewButton>
            </div>
          ) : null}
        </div>
      </div>

      <div data-testid="catalog-grid" className={GRID[current]}>
        {children}
      </div>
    </section>
  )
}

function ViewButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex size-[50px] items-center justify-center rounded-[3.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-lj-brand)] ${
        pressed
          ? 'bg-[var(--color-lj-brand)] text-white'
          : 'bg-white text-[#d9d9d9] hover:text-[var(--color-lj-brand)]'
      }`}
    >
      {children}
    </button>
  )
}

// Иконки перенесены из макета (Frame 10 / Frame 2) координатами прямоугольников.
function TextLines({ x, y }: { x: number; y: number }) {
  return (
    <>
      <rect x={x} y={y} width="15.68" height="2.09" rx="1.05" />
      <rect x={x} y={y + 4.34} width="15.68" height="2.09" rx="1.05" />
      <rect x={x} y={y + 8.68} width="7.98" height="2.09" rx="1.05" />
    </>
  )
}

function LargeCardsIcon() {
  return (
    <svg width="50" height="50" viewBox="0 0 50 50" fill="currentColor" aria-hidden="true">
      <rect x="6.11" y="9.16" width="17.27" height="17.68" rx="1.92" />
      <TextLines x={6.11} y={30.32} />
      <rect x="26.87" y="9.16" width="17.27" height="17.68" rx="1.92" />
      <TextLines x={26.87} y={30.32} />
    </svg>
  )
}

function CompactCardsIcon() {
  return (
    <svg width="50" height="50" viewBox="0 0 50 50" fill="currentColor" aria-hidden="true">
      <rect x="9.88" y="10.82" width="12.56" height="12.56" rx="1.87" />
      <TextLines x={24.69} y={11.72} />
      <rect x="9.88" y="26.87" width="12.56" height="12.56" rx="1.87" />
      <TextLines x={24.69} y={27.77} />
    </svg>
  )
}
