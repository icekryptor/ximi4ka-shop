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
 * Hero-слайдер флагманских наборов по макету Figma (61:18477): слайд без
 * подложки на фиолетовом hero, под ним ‹ «N / M» и точки ›.
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
      className="relative flex w-[clamp(300px,25.6vw,420px)] flex-col gap-[23px]"
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
      {/* Слайд без подложки: фото, название и цена лежат прямо на фиолетовом
          hero (Figma 61:18495). */}
      <div className="flex flex-col gap-[15px]">
        <Link
          href={slide.href}
          aria-label={`Смотреть набор: ${slide.name}`}
          className="group relative block aspect-[369/360] overflow-hidden rounded-[25px] bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
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

        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-4">
            <Link
              href={slide.href}
              className="min-w-0 font-lj-mazzard font-[400] text-[1.44rem] leading-[1.02] tracking-[-0.035em] transition-opacity hover:opacity-90"
            >
              {slide.name}
            </Link>
            <p className="shrink-0 whitespace-nowrap font-lj-mazzard font-[300] text-[2.34rem] leading-none tracking-[-0.045em]">
              {formatPriceRub(slide.priceRub)}&nbsp;₽
            </p>
          </div>

          <div className="flex items-stretch gap-2.5">
            <span className="relative flex flex-1">
              <button
                type="button"
                onClick={handleAdd}
                className="lj-btn lj-btn-white flex-1 px-7 py-3.5 text-[var(--color-lj-brand-deep)]"
              >
                {added ? 'Добавлено ✓' : 'В корзину →'}
              </button>
              <AddToCartBurst burstKey={burstKey} />
            </span>
            <Link
              href={slide.href}
              className="lj-btn lj-btn-outline-light flex-1 px-3.5 font-[700] text-[0.875rem] leading-[1.18] tracking-normal"
            >
              Смотреть →
            </Link>
          </div>
        </div>

        <span role="status" aria-live="polite" className="sr-only">
          {added ? 'Товар добавлен в корзину' : ''}
        </span>
      </div>

      {/* ‹ счётчик + точки › — только при > 1 слайда */}
      {count > 1 && (
        <div className="flex items-start justify-between">
          <button
            type="button"
            onClick={prev}
            aria-label="Предыдущий набор"
            className="-mx-2 inline-flex h-6 items-center px-2 text-base leading-6 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-white"
          >
            ‹
          </button>
          <div className="flex flex-col items-center gap-2">
            <span
              aria-live="polite"
              aria-atomic="true"
              className="font-lj-mazzard font-[700] text-[0.875rem] leading-[1.18]"
            >
              {index + 1} / {count}
            </span>
            <div className="flex items-center gap-2" role="tablist" aria-label="Выбор набора">
              {slides.map((s, i) => (
                <button
                  key={s.slug}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Набор ${i + 1}: ${s.name}`}
                  onClick={() => go(i)}
                  className={`rounded-[4px] bg-[var(--color-lj-on-bright)] transition-all duration-300 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                    i === index ? 'h-1.5 w-[18px]' : 'size-[5px] hover:opacity-80'
                  }`}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={next}
            aria-label="Следующий набор"
            className="-mx-2 inline-flex h-6 items-center px-2 text-base leading-6 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-white"
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}
