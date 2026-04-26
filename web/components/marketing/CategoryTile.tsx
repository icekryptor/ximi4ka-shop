import Link from 'next/link'
import type { ProductCategory } from '@ximi4ka-shop/shared'

interface Props {
  category: ProductCategory
  tintIndex: number
}

const TINTS = [
  'from-[rgba(141,103,255,0.15)] to-[rgba(141,103,255,0.05)]',
  'from-[rgba(200,86,255,0.15)] to-[rgba(200,86,255,0.05)]',
  'from-[rgba(170,100,255,0.15)] to-[rgba(170,100,255,0.05)]',
]

export function CategoryTile({ category, tintIndex }: Props) {
  const tint = TINTS[tintIndex % TINTS.length]
  return (
    <Link
      href={`/categories/${category.slug}`}
      className={`block rounded-[var(--radius-lg)] bg-gradient-to-br ${tint} p-8 min-h-[220px] transition hover:shadow-[var(--shadow-lg)]`}
    >
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
