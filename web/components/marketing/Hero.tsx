import { GridOverlay } from '@/components/ui/GridOverlay'
import { PromoSlider } from './PromoSlider'
import type { PromoSlide } from '@/lib/promoSlides'

interface Props {
  /** Бренд и тема страницы — единственный <h1>, виден только скринридерам и поисковикам. */
  title: string
  subtitle: string
  /** Слайды промо-слайдера (акция, новинка, учебная платформа). */
  slides: PromoSlide[]
}

/**
 * Первый экран главной — промо-слайдер на фиолетовом фоне по макету
 * Figma «Главная — 1440» → Hero (17:129): сплошной #8d67ff со скруглением
 * 150px снизу и пунктирной сеткой, белый текст. На 1440 отступы по 80px и
 * высота 767px; уже — скругление и кегль сжимаются. Заголовки слайдов — h2,
 * поэтому общий h1 страницы остаётся скрытым визуально, но на месте.
 */
export function Hero({ title, subtitle, slides }: Props) {
  return (
    <section className="relative flex items-center overflow-hidden rounded-b-[clamp(48px,10.4vw,150px)] bg-[var(--color-lj-bright-start)] px-6 pt-16 pb-24 text-[var(--color-lj-on-bright)] lg:min-h-[767px] lg:px-20 lg:py-24">
      <GridOverlay surface="bright" />

      <h1 className="sr-only">
        {title} — {subtitle}
      </h1>

      <div className="relative z-[2] mx-auto w-full max-w-[var(--max-lj-content)]">
        <PromoSlider slides={slides} />
      </div>
    </section>
  )
}
