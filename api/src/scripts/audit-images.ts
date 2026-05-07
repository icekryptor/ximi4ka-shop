import { fileURLToPath } from 'node:url'

interface ProductLite {
  id: string
  sku: string | null
  slug: string
  name: string
  categories?: Array<{ name: string }>
}

export function groupByPrimaryCategory(
  products: ProductLite[],
): Map<string, ProductLite[]> {
  const map = new Map<string, ProductLite[]>()
  for (const p of products) {
    const key = p.categories?.[0]?.name ?? 'Без категории'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }
  return map
}

export function formatBacklogTable(products: ProductLite[]): string {
  const lines = ['| SKU | Slug | Name | Admin |', '|---|---|---|---|']
  for (const p of products) {
    lines.push(
      `| ${p.sku ?? '—'} | \`${p.slug}\` | ${p.name} | http://localhost:3000/admin/products/${p.id} |`,
    )
  }
  return lines.join('\n')
}

async function main(): Promise<void> {
  // Lazy-import the DataSource so the helper exports above stay testable
  // without a live DATABASE_URL (the dataSource module throws at import time
  // when the env var is missing).
  await import('reflect-metadata')
  await import('dotenv/config')
  const { AppDataSource } = await import('../config/dataSource.js')
  const { Product } = await import('../entities/Product.js')

  await AppDataSource.initialize()
  try {
    const repo = AppDataSource.getRepository(Product)
    const products = await repo.find({
      where: { isPublished: true },
      relations: { images: true, categories: true },
      order: { sortOrder: 'ASC' },
    })
    const missing = products.filter((p) => p.images.length === 0)

    if (missing.length === 0) {
      console.log('✓ All published products have at least one image.')
      return
    }

    const byCategory = groupByPrimaryCategory(missing as ProductLite[])
    console.log(
      `\n# Photography backlog — ${missing.length} products missing images\n`,
    )
    for (const [categoryName, items] of byCategory) {
      console.log(`## ${categoryName} (${items.length})\n`)
      console.log(formatBacklogTable(items))
      console.log('')
    }
  } finally {
    await AppDataSource.destroy()
  }
}

// Only run main() when invoked directly via `tsx`/`node`, not when imported by tests.
// In ESM there's no `require.main`; compare argv[1] to this module's path.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
