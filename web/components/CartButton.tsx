'use client'

import { useEffect, useRef, useState } from 'react'
import { openCartDrawer, useCart } from '@/lib/cart'

/**
 * Заметная кнопка корзины в шапке. Клик МГНОВЕННО открывает CartDrawer
 * (dispatch OPEN_CART_EVENT через openCartDrawer) — никакой навигации и
 * компиляции роута; ссылка на страницу /cart живёт внутри самого drawer.
 *
 * Видна всегда, включая мобильную шапку (на узких экранах прячется только
 * слово «Корзина», колба и бейдж остаются). Бейдж-счётчик обновляется
 * реактивно из useCart и коротко «подпрыгивает» при добавлении товара
 * (animate-lj-badge-pop в globals.css, гаснет при prefers-reduced-motion).
 */
export function CartButton() {
  const { itemCount } = useCart()
  // key-счётчик вместо boolean: ремоунт бейджа перезапускает CSS-анимацию
  // даже когда товары добавляют несколько раз подряд.
  const [pulseKey, setPulseKey] = useState(0)
  const prevCount = useRef(itemCount)

  useEffect(() => {
    if (itemCount > prevCount.current) {
      // Реакция на изменение внешнего стора (localStorage-корзины).
      setPulseKey((k) => k + 1)
    }
    prevCount.current = itemCount
  }, [itemCount])

  return (
    <button
      type="button"
      onClick={openCartDrawer}
      aria-label={`Корзина: товаров ${itemCount}`}
      data-testid="header-cart-button"
      className="relative inline-flex items-center gap-2.5 rounded-full px-4 py-2.5 sm:px-5 font-lj-mono text-[length:var(--text-lj-mono-sm)] font-medium uppercase tracking-[0.08em] text-white bg-[linear-gradient(135deg,#8d67ff_0%,#c856ff_100%)] shadow-[var(--shadow-glow-brand)] transition-transform duration-200 hover:scale-[1.04] active:scale-[0.97] cursor-pointer"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="w-4 h-4 shrink-0"
      >
        {/* Колба Эрленмейера — химическая «корзина» */}
        <path d="M9.5 3h5" />
        <path d="M10 3v6.2L5.2 17.7A2 2 0 0 0 7 20.6h10a2 2 0 0 0 1.8-2.9L14 9.2V3" />
        <path d="M7.6 14.6h8.8" />
      </svg>
      <span className="hidden sm:inline">Корзина</span>
      <span
        key={pulseKey}
        data-testid="header-cart-count"
        className={`inline-flex items-center justify-center min-w-[1.375rem] h-[1.375rem] px-1 rounded-full bg-white text-[var(--color-lj-brand-deep)] text-[0.6875rem] font-[700] leading-none ${
          pulseKey > 0 ? 'animate-lj-badge-pop' : ''
        }`}
      >
        {itemCount}
      </span>
    </button>
  )
}
