import Image from 'next/image'
import Link from 'next/link'
import { GridOverlay } from '@/components/ui/GridOverlay'
import { HeroSlider } from './HeroSlider'
import type { HeroSlide } from '@/lib/heroSlides'

interface CtaProps {
  label: string
  href: string
}

interface Props {
  /** Первая строка заголовка — Mazzard H ExtraBold Italic («ХИМИЧКА»). */
  title: string
  /** Вторая строка — Mazzard H Light Italic («Наборы для опытов»). */
  subtitle: string
  lead: string
  primaryCta: CtaProps
  secondaryCta?: CtaProps
  /**
   * Слайдер флагманских наборов справа (стрелки/точки/свайп). Каждый слайд —
   * реальный DB-продукт с фото, ценой и CTA. Скрыт < lg.
   */
  slides?: HeroSlide[]
}

/**
 * Hero главной по макету Figma «Главная — 1440» → Hero (17:129): сплошной
 * фиолетовый #8d67ff со скруглением 150px снизу и пунктирной сеткой, белый
 * текст слева, справа слайдер набора без подложки карточки. На 1440 отступы
 * по 80px и высота 767px, как в макете; уже — скругление и кегль сжимаются.
 */
export function Hero({ title, subtitle, lead, primaryCta, secondaryCta, slides }: Props) {
  const hasSlider = !!slides && slides.length > 0
  return (
    <section className="relative flex items-center overflow-hidden rounded-b-[clamp(48px,10.4vw,150px)] bg-[var(--color-lj-bright-start)] px-6 pt-16 pb-24 text-[var(--color-lj-on-bright)] lg:min-h-[767px] lg:px-20 lg:py-24">
      <GridOverlay surface="bright" />

      <div className="relative z-[2] mx-auto w-full max-w-[var(--max-lj-content)] lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-16">
        <div className="flex max-w-[42.75rem] flex-col items-start gap-[30px]">
          <h1 className="flex flex-col gap-3 font-lj-mazzard text-[clamp(2.5rem,5vw,4.5rem)] leading-[0.9]">
            <span className="font-lj-mazzard font-[800] italic">{title}</span>
            <span className="font-lj-mazzard font-[300] italic tracking-[-0.045em]">
              {subtitle}
            </span>
          </h1>

          <p className="text-[1.125rem] leading-[1.375] lg:text-[1.25rem]">{lead}</p>

          {/* Ниже sm обе кнопки не помещаются в ряд — ставим их друг под
              другом во всю ширину (мобильного hero в макете нет). */}
          <div className="flex flex-wrap items-center gap-4 max-sm:w-full">
            <Link href={primaryCta.href} className="lj-btn lj-btn-white px-7 py-4 max-sm:w-full">
              {primaryCta.label}
              <Image
                src="/img/icons/arrow-right-14.svg"
                width={14}
                height={14}
                alt=""
                aria-hidden="true"
                unoptimized
              />
            </Link>
            {secondaryCta && (
              <Link
                href={secondaryCta.href}
                className="lj-btn lj-btn-outline-light px-7 py-4 max-sm:w-full"
              >
                {secondaryCta.label}
              </Link>
            )}
          </div>
        </div>

        {hasSlider ? (
          <div className="hidden lg:block">
            <HeroSlider slides={slides!} />
          </div>
        ) : null}
      </div>
    </section>
  )
}
