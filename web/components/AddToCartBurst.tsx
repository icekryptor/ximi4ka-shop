'use client'

interface Props {
  /**
   * Счётчик кликов «В корзину»: 0 — реакции ещё не было (ничего не рендерим),
   * каждое увеличение ремоунтит overlay по key и перезапускает CSS-анимацию.
   */
  burstKey: number
}

/**
 * CSS-«реакция» при добавлении товара в корзину: вспышка-кольцо вокруг
 * кнопки и брендовые пузырьки, всплывающие как из колбы. Ключевые кадры
 * живут в globals.css (lj-add-flash / lj-bubble-rise), никаких JS-библиотек;
 * prefers-reduced-motion отключает обе анимации.
 *
 * Родительский элемент обязан быть position: relative — overlay растянут
 * absolute inset-0 поверх кнопки и не ловит клики.
 */
export function AddToCartBurst({ burstKey }: Props) {
  if (burstKey === 0) return null
  return (
    <span
      key={burstKey}
      aria-hidden="true"
      data-testid="add-to-cart-burst"
      className="pointer-events-none absolute inset-0"
    >
      <span className="lj-add-flash absolute inset-0 rounded-full" />
      <span className="lj-bubble left-[16%]" />
      <span className="lj-bubble left-[38%]" style={{ animationDelay: '90ms' }} />
      <span className="lj-bubble left-[60%]" style={{ animationDelay: '150ms' }} />
      <span className="lj-bubble left-[80%]" style={{ animationDelay: '50ms' }} />
    </span>
  )
}
