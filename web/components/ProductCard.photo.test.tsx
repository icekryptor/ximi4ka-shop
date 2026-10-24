import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProductCard } from './ProductCard'
import type { Product } from '@ximi4ka-shop/shared'

// next/image в тестах приводит quality к значению по умолчанию (75), поэтому
// проверяем то, что ProductCard передаёт в компонент.
vi.mock('next/image', () => ({
  default: ({ fill, priority, quality, sizes, alt, src }: Record<string, unknown>) => {
    void fill
    void priority
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={alt as string}
        src={src as string}
        sizes={sizes as string}
        data-quality={quality as number}
      />
    )
  },
}))

beforeEach(() => {
  // @ts-expect-error - test stub
  global.IntersectionObserver = class {
    constructor(public cb: (entries: Partial<IntersectionObserverEntry>[]) => void) {}
    observe(el: Element) {
      this.cb([{ isIntersecting: true, target: el }])
    }
    unobserve() {}
    disconnect() {}
  }
})

const product = {
  id: '1',
  slug: 'himichka-3',
  sku: 'X-30',
  name: 'Химичка 3.0',
  shortDescription: 'Флагман',
  priceRub: 3399,
  compareAtPriceRub: null,
  stockStatus: 'in_stock',
  isPublished: true,
  longDescriptionBlocks: [],
  imageUrl: null,
} as unknown as Product

const images = [
  { id: 'i1', productId: '1', url: '/a.png', alt: 'a', sortOrder: 0 },
  { id: 'i2', productId: '1', url: '/b.png', alt: 'b', sortOrder: 1 },
]

function renderCard(featured = false) {
  render(
    <ProductCard
      product={product}
      stats={{ reagents: 18, instruments: 12, reactions: 161 }}
      statMaxes={{ reagents: 18, instruments: 20, reactions: 161 }}
      images={images}
      featured={featured}
    />,
  )
}

describe('<ProductCard> фото на телефоне', () => {
  // С «100vw» браузер брал вариант 750 px для карточки в ~362 px (PSI mobile).
  it.each([false, true])(
    'считает ширину фото как 100vw минус поля страницы 48px (featured=%s)',
    (featured) => {
      renderCard(featured)
      const photos = screen.getAllByRole('img')
      expect(photos).toHaveLength(2)
      for (const img of photos) {
        expect(img.getAttribute('sizes')).toMatch(/^\(max-width: 768px\) calc\(100vw - 48px\), /)
      }
    },
  )

  it('просит у оптимизатора quality 65, а не 75 по умолчанию', () => {
    renderCard()
    for (const img of screen.getAllByRole('img')) {
      expect(img.getAttribute('data-quality')).toBe('65')
    }
  })
})
