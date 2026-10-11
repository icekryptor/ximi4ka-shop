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
 * Первый экран главной — промо-слайдер из трёх баннеров по макету Figma
 * «Главная — 1440» → Hero и «баннеры». Баннер отступает на 20px от краёв
 * экрана и от тикера сверху; верх скруглён на 100, низ на 150 (размеры
 * масштабируются вместе с баннером — см. PromoSlider). Заголовки слайдов —
 * h2, поэтому общий h1 страницы остаётся скрытым визуально, но на месте.
 */
export function Hero({ title, subtitle, slides }: Props) {
  return (
    <section className="p-5">
      <h1 className="sr-only">
        {title} — {subtitle}
      </h1>

      <div className="mx-auto w-full max-w-[1600px]">
        <PromoSlider slides={slides} />
      </div>
    </section>
  )
}
