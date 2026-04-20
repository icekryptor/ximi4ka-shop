import { listCategories } from '@/lib/api'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import { CategoryCard } from '@/components/CategoryCard'

export const revalidate = 60

async function fetchCategories(): Promise<ProductCategory[]> {
  try {
    const res = await listCategories({ limit: 100 })
    return res.data
  } catch {
    return []
  }
}

export default async function CategoriesListPage() {
  const categories = await fetchCategories()

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <section className="mb-8">
        <h1 className="text-4xl font-bold text-brand-text">Категории</h1>
      </section>

      {categories.length === 0 ? (
        <p className="text-brand-text-secondary">Категории пока не добавлены.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      )}
    </div>
  )
}
