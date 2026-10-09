import Image from 'next/image'
import type { PromoSlide } from '@/lib/promoSlides'

const CARD =
  'relative aspect-square w-[clamp(300px,28vw,440px)] overflow-hidden rounded-[25px] bg-white text-[var(--color-lj-ink)]'

/**
 * Иллюстрация справа на слайде. Декоративная (aria-hidden), кроме фото
 * набора — у него есть alt. Рисуем в той же палитре, что hero: белая
 * плашка на фиолетовом, акцент — глубокий фиолетовый.
 */
export function PromoSlideArt({ slide, priority }: { slide: PromoSlide; priority?: boolean }) {
  if (slide.visual === 'product' && slide.imageUrl) {
    return (
      <div className={CARD}>
        <Image
          src={slide.imageUrl}
          alt={slide.imageAlt ?? slide.title}
          fill
          priority={priority}
          sizes="(max-width: 1023px) 0px, 28vw"
          className="object-cover"
        />
      </div>
    )
  }
  if (slide.visual === 'platform') return <PlatformArt />
  if (slide.visual === 'product') return <ProductFallbackArt />
  return <GiftArt />
}

/** Колба, выглядывающая из подарочной коробки с бантом. */
function GiftArt() {
  return (
    <div className={CARD} aria-hidden="true">
      <svg viewBox="0 0 400 400" className="size-full">
        {/* колба */}
        <g strokeLinejoin="round">
          <path
            d="M168 40h64v86l62 108a22 22 0 0 1-19 33H125a22 22 0 0 1-19-33l62-108Z"
            fill="#f4f1ff"
            stroke="#6703ff"
            strokeWidth="6"
          />
          <path d="M134 196h132l28 38a22 22 0 0 1-19 33H125a22 22 0 0 1-19-33Z" fill="#8d67ff" />
          <circle cx="170" cy="222" r="7" fill="#fff" fillOpacity=".7" />
          <circle cx="205" cy="212" r="4" fill="#fff" fillOpacity=".7" />
          <line x1="160" y1="40" x2="240" y2="40" stroke="#6703ff" strokeWidth="6" />
        </g>
        {/* коробка */}
        <rect x="92" y="266" width="216" height="104" rx="8" fill="#6703ff" />
        <rect x="76" y="238" width="248" height="42" rx="8" fill="#8d67ff" />
        <rect x="184" y="238" width="32" height="132" fill="#fff" />
        {/* бант */}
        <path
          d="M200 238c-34-6-62-22-50-44 14-22 46 2 50 44Zm0 0c34-6 62-22 50-44-14-22-46 2-50 44Z"
          fill="#fff"
          stroke="#6703ff"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        {/* искры */}
        <g stroke="#6703ff" strokeWidth="5" strokeLinecap="round">
          <path d="M330 90v28M316 104h28" />
          <path d="M66 140v20M56 150h20" />
          <path d="M310 190v16M302 198h16" />
        </g>
      </svg>
    </div>
  )
}

/** Запасной вариант слайда ОГЭ, пока у набора нет фото. */
function ProductFallbackArt() {
  return (
    <div className={`${CARD} grid place-items-center`} aria-hidden="true">
      <span className="font-lj-mazzard text-[clamp(5rem,9vw,9rem)] font-[800] italic leading-none tracking-[-0.045em] text-[var(--color-lj-brand-deep)]">
        ОГЭ
      </span>
    </div>
  )
}

/** Окно браузера с уроком — намёк на учебную платформу. */
function PlatformArt() {
  return (
    <div className={`${CARD} flex flex-col`} aria-hidden="true">
      <div className="flex items-center gap-3 border-b border-[var(--color-lj-rule-soft)] bg-[var(--color-lj-cream-shade)] px-5 py-3.5">
        <span className="flex gap-1.5">
          <i className="size-2.5 rounded-full bg-[var(--color-lj-rule)]" />
          <i className="size-2.5 rounded-full bg-[var(--color-lj-rule)]" />
          <i className="size-2.5 rounded-full bg-[var(--color-lj-rule)]" />
        </span>
        <span className="flex-1 truncate rounded-full bg-white px-4 py-1.5 font-lj-mazzard text-[0.8125rem] font-[500] tracking-[0.02em]">
          learn.ximi4ka.ru
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-5 p-6">
        <div className="relative grid flex-1 place-items-center overflow-hidden rounded-[15px] bg-[var(--color-lj-brand-deep)]">
          <span className="grid size-16 place-items-center rounded-full bg-white">
            <svg viewBox="0 0 24 24" className="ml-1 size-7 text-[var(--color-lj-brand-deep)]">
              <path d="M6 4l15 8-15 8Z" fill="currentColor" />
            </svg>
          </span>
          <span className="absolute bottom-3 left-4 font-lj-mazzard text-[0.8125rem] font-[500] text-white/80">
            Видеоурок
          </span>
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="h-2 overflow-hidden rounded-full bg-[var(--color-lj-cream-shade)]">
            <div className="h-full w-2/3 rounded-full bg-[var(--color-lj-brand)]" />
          </div>
          <div className="flex justify-between font-lj-mazzard text-[0.8125rem] font-[500]">
            <span>Ваш прогресс</span>
          </div>
        </div>
      </div>
    </div>
  )
}
