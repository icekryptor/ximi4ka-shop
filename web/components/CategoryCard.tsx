import Link from 'next/link'
import type { ProductCategory } from '@ximi4ka-shop/shared'

export function CategoryCard({ category }: { category: ProductCategory }) {
  return (
    <Link
      href={`/categories/${category.slug}`}
      className="border border-gray-200 rounded-2xl p-6 hover:shadow-md transition block"
    >
      <h3 className="font-semibold text-lg">{category.name}</h3>
    </Link>
  )
}
