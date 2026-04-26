'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Product } from '@ximi4ka-shop/shared'
import { MobileBuyBar } from '@/components/product'

interface Props {
  product: Pick<Product, 'id' | 'slug' | 'name' | 'priceRub' | 'stockStatus'>
}

/**
 * Finds the desktop add-to-cart row (marked with `data-add-to-cart-row`)
 * and uses it as the IntersectionObserver sentinel for the mobile sticky
 * buy bar. The bar appears once the user has scrolled past the row.
 *
 * Wrapped in a client component because the page itself is a Server
 * Component and cannot own DOM refs. We read the sentinel into state in
 * an effect (genuine sync with an external DOM system) and re-derive a
 * fresh ref object via `useMemo` so MobileBuyBar's `[sentinelRef]` effect
 * reruns once the node is known.
 */
export function MobileBuyBarMount({ product }: Props) {
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null)

  useEffect(() => {
    // Reading from the DOM (an external system) is exactly what effects
    // are for; the lint rule misclassifies this. Suppressed locally.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSentinel(document.querySelector<HTMLElement>('[data-add-to-cart-row]'))
  }, [])

  const sentinelRef = useMemo(() => ({ current: sentinel }), [sentinel])

  return <MobileBuyBar product={product} sentinelRef={sentinelRef} />
}
