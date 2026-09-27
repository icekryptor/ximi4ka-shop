import type { Metadata } from 'next'
import { buildMetadata } from '@/lib/metadata'

// Чекаут — служебная клиентская страница, в поиске ей делать нечего.
// Страница `'use client'`, поэтому metadata живёт в layout, как у корзины.
export const metadata: Metadata = buildMetadata({
  title: 'Оформление заказа — Химичка',
  description: 'Оформление заказа',
  pathname: '/checkout',
  noindex: true,
})

export default function CheckoutLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
