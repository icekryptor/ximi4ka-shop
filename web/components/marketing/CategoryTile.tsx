import Link from 'next/link'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import { Sticker } from '@/components/ui'

interface Props {
  category: ProductCategory
  tintIndex: number
  span?: 1 | 2
  productCount?: number
}

const TINTS = [
  'from-[rgba(141,103,255,0.15)] to-[rgba(141,103,255,0.05)]',
  'from-[rgba(200,86,255,0.15)] to-[rgba(200,86,255,0.05)]',
  'from-[rgba(170,100,255,0.15)] to-[rgba(170,100,255,0.05)]',
]

export function CategoryTile({
  category,
  tintIndex,
  span = 1,
  productCount,
}: Props) {
  const tint = TINTS[tintIndex % TINTS.length]
  const spanClass = span === 2 ? 'md:col-span-2' : ''
  return (
    <Link
      href={`/categories/${category.slug}`}
      className={`relative block rounded-[var(--radius-lg)] bg-gradient-to-br ${tint} p-8 min-h-[220px] transition hover:shadow-[var(--shadow-lg)] ${spanClass}`}
    >
      {productCount !== undefined && (
        <Sticker variant="accent" className="absolute top-4 right-4">
          {productCount} товаров
        </Sticker>
      )}
      <div className="flex flex-col gap-3">
        <h3 className="font-[var(--font-display)] text-[length:var(--text-h3)] text-[var(--color-brand-text)] tracking-[var(--tracking-tight)]">
          {category.name}
        </h3>
        {category.metaDescription && (
          <p className="text-[length:var(--text-small)] text-[var(--color-brand-text-secondary)]">
            {category.metaDescription}
          </p>
        )}
      </div>
    </Link>
  )
}
