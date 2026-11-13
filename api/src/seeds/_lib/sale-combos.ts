// Привязка к категории «Комбо» двух комбо, которые владелец завёл в админке
// (13.11.2026): «Все четыре набора!» (all-4-kits) и «Запас всех реактивов по
// 1 шт» (zapas-reaktivov-1). Товары опубликованы, но ни в одной категории не
// лежат — в админке пока нет выбора категорий у товара. Идемпотентно: уже
// привязанный товар не трогается. Те же слаги показывает страница /sale
// (web/lib/blackFriday.ts, SALE_EXTRA_COMBO_SLUGS) — правишь оба места.
import type { DataSource } from 'typeorm'
import { In, IsNull } from 'typeorm'
import { Product } from '../../entities/Product.js'
import { ProductCategory } from '../../entities/ProductCategory.js'

export const SALE_COMBO_SLUGS = ['all-4-kits', 'zapas-reaktivov-1'] as const
const COMBO_CATEGORY_SLUG = 'combo'

export interface SaleComboOutcome {
  slug: string
  action: 'linked' | 'already-linked' | 'missing'
}

export async function linkSaleCombos(
  dataSource: DataSource,
  options: { dryRun?: boolean } = {},
): Promise<SaleComboOutcome[]> {
  const dryRun = options.dryRun === true
  return dataSource.transaction(async (em) => {
    const combo = await em.findOne(ProductCategory, {
      where: { slug: COMBO_CATEGORY_SLUG },
      relations: { products: true },
    })
    if (!combo) throw new Error(`Категория ${COMBO_CATEGORY_SLUG} не найдена в БД`)
    const linked = new Set(combo.products.map((p) => p.id))
    const rows = await em.find(Product, {
      where: { slug: In([...SALE_COMBO_SLUGS]), deletedAt: IsNull() },
    })
    const bySlug = new Map(rows.map((p) => [p.slug, p]))
    const report: SaleComboOutcome[] = []
    for (const slug of SALE_COMBO_SLUGS) {
      const p = bySlug.get(slug)
      if (!p) {
        report.push({ slug, action: 'missing' })
        continue
      }
      if (linked.has(p.id)) {
        report.push({ slug, action: 'already-linked' })
        continue
      }
      // Связь «категория — товары» хранит сторона категории (@JoinTable там).
      if (!dryRun) {
        await em.createQueryBuilder().relation(ProductCategory, 'products').of(combo).add(p.id)
      }
      report.push({ slug, action: 'linked' })
    }
    return report
  })
}
