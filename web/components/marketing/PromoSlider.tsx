'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { PromoSlide } from '@/lib/promoSlides'
import { PromoSlideArt } from './PromoSlideArt'

interface Props {
  slides: PromoSlide[]
  /** мс между авто-переключениями; 0 = без автопрокрутки */
  autoPlayMs?: number
}

const CTA_CLASS = 'lj-btn lj-btn-white px-7 py-4 max-sm:w-full'

/**
 * Промо-слайдер первого экрана. Все слайды лежат в одной ячейке сетки,
 * поэтому высота блока задаётся самым высоким и при переключении ничего не
 * прыгает; неактивные скрыты (opacity + visibility + inert), но остаются в
 * DOM — их текст виден поисковикам. Управление: стрелки ‹ ›, точки, свайп,
 * клавиши ← →. Автопрокрутка встаёт на паузу при наведении и фокусе и
 * отключается при prefers-reduced-motion.
 */
export function PromoSlider({ slides, autoPlayMs = 7000 }: Props) {
  const [index, setIndex] = useState(0)
  const [reduced, setReduced] = useState(false)
  const [paused, setPaused] = useState(false)
  const touchStartX = useRef<number | null>(null)

  const count = slides.length
  const clamp = useCallback((i: number) => ((i % count) + count) % count, [count])
  const next = useCallback(() => setIndex((i) => clamp(i + 1)), [clamp])
  const prev = useCallback(() => setIndex((i) => clamp(i - 1)), [clamp])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduced(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (reduced || paused || count < 2 || autoPlayMs <= 0) return
    const id = window.setInterval(next, autoPlayMs)
    return () => window.clearInterval(id)
  }, [reduced, paused, count, autoPlayMs, next])

  if (count === 0) return null

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

  return (
    <div
      className="flex flex-col gap-12"
      role="group"
      aria-roledescription="карусель"
      aria-label="Акции и новости"
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="grid">
        {slides.map((slide, i) => {
          const active = i === index
          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="слайд"
              aria-label={`${i + 1} из ${count}`}
              aria-hidden={!active}
              inert={!active}
              className={`col-start-1 row-start-1 transition-[opacity,visibility] motion-reduce:transition-none lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-16 ${
                active
                  ? 'visible opacity-100 duration-500 delay-200'
                  : 'invisible opacity-0 duration-200'
              }`}
            >
              <div className="flex max-w-[42.75rem] flex-col items-start gap-[30px]">
                <span className="rounded-full border border-[var(--color-lj-on-bright)] px-4 py-1.5 font-lj-mazzard text-[0.8125rem] font-[500] uppercase leading-none tracking-[0.08em]">
                  {slide.eyebrow}
                </span>
                <h2 className="font-lj-mazzard text-[clamp(2.5rem,5.6vw,5.25rem)] font-[800] italic leading-[0.92] tracking-[-0.03em] [overflow-wrap:anywhere]">
                  {slide.title}
                </h2>
                <p className="max-w-[32rem] text-[1.125rem] leading-[1.375] lg:text-[1.25rem]">
                  {slide.lead}
                </p>
                <div className="max-sm:w-full">
                  {slide.cta.external ? (
                    <a
                      href={slide.cta.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={CTA_CLASS}
                    >
                      {slide.cta.label}
                      <ArrowIcon />
                    </a>
                  ) : (
                    <Link href={slide.cta.href} className={CTA_CLASS}>
                      {slide.cta.label}
                      <ArrowIcon />
                    </Link>
                  )}
                </div>
              </div>

              <div className="hidden lg:block">
                <PromoSlideArt slide={slide} priority={i === 0} />
              </div>
            </div>
          )
        })}
      </div>

      {count > 1 && (
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={prev}
            aria-label="Предыдущий слайд"
            className="-mx-2 inline-flex h-8 items-center px-2 text-xl leading-none transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-white"
          >
            ‹
          </button>
          <span
            aria-live="polite"
            aria-atomic="true"
            className="font-lj-mazzard text-[0.875rem] font-[700] leading-[1.18]"
          >
            {index + 1} / {count}
          </span>
          <div className="flex items-center gap-2" role="tablist" aria-label="Выбор слайда">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Слайд ${i + 1}: ${s.title}`}
                onClick={() => setIndex(i)}
                className={`rounded-[4px] bg-[var(--color-lj-on-bright)] transition-all duration-300 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  i === index ? 'h-1.5 w-[18px]' : 'size-[5px] hover:opacity-80'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={next}
            aria-label="Следующий слайд"
            className="-mx-2 inline-flex h-8 items-center px-2 text-xl leading-none transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-white"
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}

function ArrowIcon() {
  return (
    <Image
      src="/img/icons/arrow-right-14.svg"
      width={14}
      height={14}
      alt=""
      aria-hidden="true"
      unoptimized
    />
  )
}
