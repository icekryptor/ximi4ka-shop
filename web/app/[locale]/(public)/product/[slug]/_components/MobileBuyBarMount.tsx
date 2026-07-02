'use client'

import { useEffect, useState } from 'react'
import type { Product } from '@ximi4ka-shop/shared'
import { MobileBuyBarLJ } from '@/components/product/MobileBuyBarLJ'
import { useCart } from '@/lib/cart'

interface Props {
  product: Pick<
    Product,
    'id' | 'slug' | 'name' | 'priceRub' | 'stockStatus' | 'images'
  >
}

/**
 * Locates the desktop add-to-cart row (marked with `data-add-to-cart-row`)
 * and uses it as an IntersectionObserver sentinel for the v3
 * lab-journal mobile buy bar. The bar slides into view once the user
 * has scrolled past the row.
 *
 * Wrapped in a client component because the page itself is a Server
 * Component and cannot own DOM refs / observe scroll. The cart-add
 * logic is co-located here (rather than in MobileBuyBarLJ) so the
 * presentational LJ component stays thin and easy to test.
 */
export function MobileBuyBarMount({ product }: Props) {
  const [shown, setShown] = useState(false)
  const [hasSentinel, setHasSentinel] = useState(false)
  const { add } = useCart()

  useEffect(() => {
    const sentinel = document.querySelector<HTMLElement>(
      '[data-add-to-cart-row]',
    )
    // Reading from the DOM (an external system) is exactly what effects
    // are for; the set-state-in-effect rule misclassifies this.
    if (!sentinel) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasSentinel(false)
      return
    }
    setHasSentinel(true)
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        // Show once the sentinel is OUT of view (user scrolled past it).
        setShown(!entry.isIntersecting)
      },
      { threshold: 0 },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  if (!hasSentinel) return null

  const isOutOfStock = product.stockStatus === 'out_of_stock'

  const handleAdd = () => {
    if (isOutOfStock) return
    add(
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        priceRub: product.priceRub,
        image: product.images[0]?.url,
      },
      1,
    )
  }

  // Slide-up wrapper handles entrance/exit; MobileBuyBarLJ owns its own
  // fixed-bottom positioning + ink palette.
  return (
    <div
      className={`transition-transform duration-300 ${
        shown ? 'translate-y-0' : 'translate-y-full'
      }`}
      aria-hidden={!shown}
    >
      <MobileBuyBarLJ
        priceRub={product.priceRub}
        onAddToCart={handleAdd}
        disabled={isOutOfStock}
      />
    </div>
  )
}
