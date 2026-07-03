'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useCart } from '@/lib/cart'
import { AddToCartBurst } from '@/components/AddToCartBurst'
import { formatPriceRub, type HeroSlide } from '@/lib/heroSlides'

interface Props {
  slides: HeroSlide[]
  /** мс между авто-переключениями; 0 = без автопрокрутки */
  autoPlayMs?: number
}

/**
 * Hero-слайдер флагманских наборов (v3.5 «Лабораторный журнал, ярче»).
 *
 * Лёгкий, без карусель-библиотек: один активный слайд рендерится,
 * остальные держатся смонтированными только через фото-precache Next/Image
 * (priority лишь на первом). Управление: стрелки ‹ ›, точки-индикаторы,
 * свайп на тач, клавиатура (← →). Автопрокрутка опциональна и полностью
 * отключается при prefers-reduced-motion. aria-roledescription=carousel,
 * каждый слайд — group c «N из M».
 */
export function HeroSlider({ slides, autoPlayMs = 6000 }: Props) {
  const [index, setIndex] = useState(0)
  const [reduced, setReduced] = useState(false)
  const [paused, setPaused] = useState(false)
  const [burstKey, setBurstKey] = useState(0)
  const [added, setAdded] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const { add } = useCart()

  const count = slides.length
  const clamp = useCallback((i: number) => ((i % count) + count) % count, [count])
  const go = useCallback((i: number) => setIndex(clamp(i)), [clamp])
  const next = useCallback(() => setIndex((i) => clamp(i + 1)), [clamp])
  const prev = useCallback(() => setIndex((i) => clamp(i - 1)), [clamp])

  // Уважаем prefers-reduced-motion и реагируем на его смену на лету.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduced(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Автопрокрутка: только если > 1 слайда, включена, не на паузе и не reduced.
  useEffect(() => {
    if (reduced || paused || count < 2 || autoPlayMs <= 0) return
    const id = window.setInterval(next, autoPlayMs)
    return () => window.clearInterval(id)
  }, [reduced, paused, count, autoPlayMs, next])

  if (count === 0) return null
  const slide = slides[index]

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      next()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      prev()
    }
  }

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 40) (dx < 0 ? next : prev)()
    touchStartX.current = null
  }

  const handleAdd = () => {
    add({
      productId: slide.productId,
      slug: slide.slug,
      name: slide.name,
      priceRub: slide.priceRub,
      image: slide.imageUrl,
    })
    setBurstKey((k) => k + 1)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 2000)
  }

  return (
    <div
      className="relative w-[clamp(300px,26vw,440px)]"
      role="group"
      aria-roledescription="карусель"
      aria-label="Флагманские наборы"
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Яркая градиентная панель-оффер */}
      <div className="relative rounded-[var(--radius-lj-bright)] bg-[image:var(--gradient-lj-bright)] shadow-[var(--shadow-lj-bright)] p-5 lj-lift">
        <div
          className="flex items-center justify-between mb-4"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-on-bright-mute)]">
            {slide.label}
          </span>
          <span className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-on-bright-mute)]">
            {index + 1} / {count}
          </span>
        </div>

        {/* Фото: object-cover + скругление, вписано в контейнер (без квадратных углов) */}
        <Link
          href={slide.href}
          aria-label={`Смотреть набор: ${slide.name}`}
          className="group relative block aspect-[4/5] rounded-[var(--radius-lj-bright-sm)] overflow-hidden bg-white/95"
        >
          <Image
            key={slide.imageUrl}
            src={slide.imageUrl}
            alt={slide.alt}
            fill
            priority={index === 0}
            sizes="(max-width: 1024px) 0px, 26vw"
            className="object-cover transition-transform duration-700 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        </Link>

        {/* Название + цена */}
        <div className="mt-5">
          <Link
            href={slide.href}
            className="font-lj-display font-[700] text-[clamp(1.25rem,1.6vw,1.75rem)] leading-[1.02] tracking-[-0.035em] text-[var(--color-lj-on-bright)] hover:opacity-90 transition-opacity"
          >
            {slide.name}
          </Link>
          <p className="mt-2 font-lj-display font-[900] text-[clamp(2rem,2.6vw,3rem)] leading-none tracking-[-0.045em] text-[var(--color-lj-on-bright)]">
            {formatPriceRub(slide.priceRub)}&nbsp;₽
          </p>
        </div>

        {/* CTA: в корзину (градиент lj-cta-bright, но инвертирован — белая пилюля на градиенте) + смотреть */}
        <div className="mt-5 flex items-center gap-3">
          <span className="relative inline-flex">
            <button
              type="button"
              onClick={handleAdd}
              className="inline-flex items-center gap-2 px-6 py-3.5 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] rounded-full bg-white text-[var(--color-lj-brand-deep)] shadow-[0_6px_16px_-6px_rgba(60,20,120,0.4)] transition-transform duration-300 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {added ? 'Добавлено ✓' : 'В корзину →'}
            </button>
            <AddToCartBurst burstKey={burstKey} />
          </span>
          <Link
            href={slide.href}
            className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.08em] text-[var(--color-lj-on-bright)] underline-offset-4 hover:underline"
          >
            смотреть →
          </Link>
        </div>

        <span role="status" aria-live="polite" className="sr-only">
          {added ? 'Товар добавлен в корзину' : ''}
        </span>
      </div>

      {/* Стрелки + точки — только при > 1 слайда */}
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Предыдущий набор"
            className="absolute top-1/2 -left-3 -translate-y-1/2 z-[2] grid place-items-center w-10 h-10 rounded-full bg-white text-[var(--color-lj-ink)] shadow-[0_6px_16px_-6px_rgba(0,0,0,0.35)] transition-transform duration-300 hover:scale-105 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lj-brand-deep)]"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Следующий набор"
            className="absolute top-1/2 -right-3 -translate-y-1/2 z-[2] grid place-items-center w-10 h-10 rounded-full bg-white text-[var(--color-lj-ink)] shadow-[0_6px_16px_-6px_rgba(0,0,0,0.35)] transition-transform duration-300 hover:scale-105 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lj-brand-deep)]"
          >
            ›
          </button>
          <div
            className="mt-4 flex items-center justify-center gap-2"
            role="tablist"
            aria-label="Выбор набора"
          >
            {slides.map((s, i) => (
              <button
                key={s.slug}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Набор ${i + 1}: ${s.name}`}
                onClick={() => go(i)}
                className={`h-2 rounded-full transition-all duration-300 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lj-brand-deep)] ${
                  i === index
                    ? 'w-6 bg-[var(--color-lj-brand)]'
                    : 'w-2 bg-[var(--color-lj-ink)]/25 hover:bg-[var(--color-lj-ink)]/45'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
