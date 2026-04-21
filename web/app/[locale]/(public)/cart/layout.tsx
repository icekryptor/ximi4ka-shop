import type { Metadata } from 'next'
import { buildMetadata } from '@/lib/metadata'

// Cart is an ephemeral client-side UI surface — not something we want
// crawlers indexing. The page itself is `'use client'`, so the static
// `metadata` export lives on this route-group layout instead.
export const metadata: Metadata = buildMetadata({
  title: 'Корзина — Ximi4ka',
  description: 'Ваша корзина покупок',
  pathname: '/cart',
  noindex: true,
})

export default function CartLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
