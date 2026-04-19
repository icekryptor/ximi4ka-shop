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
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <section className="mb-8">
        <h1 className="text-4xl font-bold">Категории</h1>
      </section>

      {categories.length === 0 ? (
        <p className="text-gray-500">Категории пока не добавлены.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      )}
    </main>
  )
}
