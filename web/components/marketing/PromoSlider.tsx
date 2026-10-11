'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { GridOverlay } from '@/components/ui/GridOverlay'
import { slideTitle, type PromoSlide } from '@/lib/promoSlides'
import { PromoSlideArt } from './PromoSlideArt'

interface Props {
  slides: PromoSlide[]
  /** мс между авто-переключениями; 0 = без автопрокрутки */
  autoPlayMs?: number
}

const CTA_CLASS = 'lj-btn lj-btn-white rounded-[4px] px-7 py-4 max-sm:w-full'

/**
 * Промо-слайдер первого экрана: три баннера из Figma («баннеры», 1440×760).
 *
 * От xl (1280px) баннер — масштабируемая копия макета: все размеры считаются
 * от `--u` = 1/1440 ширины баннера, поэтому пропорции совпадают с Figma на
 * любой ширине. Уже — карточка: текст, под ним правая часть иллюстрации
 * (там `--u` = 1/900 ширины, а `--ox` сдвигает макет на 560px влево).
 *
 * Все слайды лежат в одной ячейке сетки — высота задаётся самым высоким и
 * при переключении ничего не прыгает. Неактивные скрыты (opacity + visibility
 * + inert), но остаются в DOM — их текст виден поисковикам. Управление:
 * стрелки ‹ ›, точки, свайп, клавиши ← →. Автопрокрутка встаёт на паузу при
 * наведении и фокусе и отключается при prefers-reduced-motion.
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
    // index в зависимостях: ручное переключение начинает отсчёт заново, и слайд
    // не перескакивает сразу после клика.
    const id = window.setInterval(next, autoPlayMs)
    return () => window.clearInterval(id)
  }, [reduced, paused, count, autoPlayMs, next, index])

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
      className="[container-type:inline-size]"
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
      <div className="grid overflow-hidden rounded-t-[clamp(2.5rem,8vw,6.25rem)] rounded-b-[clamp(3.75rem,12vw,9.375rem)] text-[var(--color-lj-on-bright)] [--ox:560] [--u:calc(100cqw/900)] xl:rounded-b-[calc(var(--u)*150)] xl:rounded-t-[calc(var(--u)*100)] xl:[--ox:0] xl:[--u:calc(100cqw/1440)]">
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
              // Уходящий слайд остаётся под входящим, пока тот проявляется, —
              // иначе посреди перехода просвечивает фон страницы.
              className={`relative col-start-1 row-start-1 flex flex-col px-6 pb-24 pt-14 motion-reduce:transition-none xl:block xl:aspect-[1440/760] xl:p-0 ${
                active
                  ? 'visible z-[2] opacity-100 transition-opacity duration-500'
                  : 'invisible z-[1] opacity-0 transition-[opacity,visibility] delay-500 duration-0'
              }`}
              style={{ background: slide.background }}
            >
              <GridOverlay surface="bright" />

              <div
                className="relative z-[2] flex flex-col items-start gap-[30px] xl:absolute xl:left-[calc(var(--u)*80)] xl:top-1/2 xl:w-[calc(var(--u)*680)] xl:-translate-y-1/2 xl:gap-[calc(var(--u)*30)]"
                style={
                  slide.leadWidth ? ({ '--lead-w': slide.leadWidth } as CSSProperties) : undefined
                }
              >
                <h2 className="font-lj-mazzard text-[clamp(2.25rem,9vw,4.5rem)] font-light italic leading-[1.1] tracking-[-0.045em] xl:whitespace-nowrap xl:text-[length:calc(var(--u)*72)]">
                  {slide.titleLines.map((line, n) => (
                    <Fragment key={line}>
                      {n > 0 && (
                        <>
                          {' '}
                          <br />
                        </>
                      )}
                      {line}
                    </Fragment>
                  ))}
                </h2>
                <div className="font-lj-mono text-[1.125rem] leading-[1.375] xl:w-[calc(var(--u)*var(--lead-w,680))] xl:text-[length:calc(var(--u)*20)] xl:leading-[calc(var(--u)*27.5)]">
                  {slide.leadLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
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

              <div className="relative z-[1] mx-auto mt-10 aspect-[900/760] w-full max-w-[640px] xl:absolute xl:inset-0 xl:mt-0 xl:aspect-auto xl:max-w-none">
                <PromoSlideArt visual={slide.visual} />
              </div>
            </div>
          )
        })}

        {count > 1 && (
          <div className="relative z-[3] col-start-1 row-start-1 flex items-center gap-5 self-end justify-self-start px-6 pb-8 xl:pb-[calc(var(--u)*48)] xl:pl-[calc(var(--u)*80)]">
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
                  aria-label={`Слайд ${i + 1}: ${slideTitle(s)}`}
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
