// Цены наборов и новые комбо (решение владельца от 09.11.2026).
//
// 1. Новые цены у пяти существующих товаров. Зачёркнутая цена не трогается,
//    если она выше новой; если стала не выше — обнуляется, иначе витрина
//    показала бы «скидку» вверх.
// 2. Два новых товара в категории «Комбо»:
//    - «Все четыре набора» (vse-chetyre-nabora): Химичка 3.0, Электрохимичка,
//      Мини-Химичка и набор для ОГЭ. Фото — главные фото четырёх наборов,
//      коробки и вес — из SHIPPING_OVERRIDES (tilda-shipping.ts), состав —
//      списком наборов. Под этот слаг уже ждут подсказка «выгоднее комбо»
//      (web/lib/kitCombos.ts) и методички (methodichki-materials.ts).
//    - «Все реактивы по 1 шт» (vse-reaktivy-po-1-sht, артикул RRR1): все
//      реактивы каталога по одной штуке. Состава в описании нет: витрина и бот
//      заказов собирают его из категории «Реактивы», как у «Запаса всех
//      реактивов» (RRR). Фото — как у «Запаса», вес — половина его веса.
//    Зачёркнутая цена новых товаров — сумма цен входящего по отдельности.
//
// Новые товары создаются неопубликованными (WORKFLOW.md, правило 8: тексты
// сессии — черновики); --publish публикует их сразу. Повторный запуск не
// создаёт дублей: у существующего товара обновляются только цены.
import type { DataSource, EntityManager } from 'typeorm'
import { In, IsNull } from 'typeorm'
import type { Block, StockStatus } from '@ximi4ka-shop/shared'
import { Product } from '../../entities/Product.js'
import { ProductCategory } from '../../entities/ProductCategory.js'
import { ProductImage } from '../../entities/ProductImage.js'
import { SHIPPING_OVERRIDES } from './tilda-shipping.js'

export const KIT_PRICES: Readonly<Record<string, number>> = {
  'himichka-30': 3190,
  elektrohimichka: 3190,
  'mini-himichka': 1699,
  'bolshoi-nabor-dlya-oge': 3590,
  'vse-tri-nabora': 6990,
}

export const FOUR_KITS_SLUG = 'vse-chetyre-nabora'
export const FOUR_KITS_COMPONENTS = [
  'himichka-30',
  'elektrohimichka',
  'mini-himichka',
  'bolshoi-nabor-dlya-oge',
] as const
export const ONE_OF_EACH_SLUG = 'vse-reaktivy-po-1-sht'
export const ONE_OF_EACH_SKU = 'RRR1'
const ALL_REAGENTS_SOURCE_SLUG = 'zapas-vseh-reaktivov'
const COMBO_CATEGORY_SLUG = 'combo'
const REAGENTS_CATEGORY_SLUG = 'reagents'
// Комбо из реактивов внутри категории «Реактивы» — не реактив (как в web/lib/allReagents.ts).
const REAGENT_COMBO_SLUGS: readonly string[] = ['tri-kisloti']

interface NewComboSpec {
  slug: string
  sku: string
  name: string
  priceRub: number
  shortDescription: string
}

export const NEW_COMBOS: readonly NewComboSpec[] = [
  {
    slug: FOUR_KITS_SLUG,
    sku: '7VGBLO26',
    name: 'Все четыре набора',
    priceRub: 9330,
    shortDescription: 'Химичка 3.0, Электрохимичка, Мини-Химичка и набор для ОГЭ одним заказом',
  },
  {
    slug: ONE_OF_EACH_SLUG,
    sku: ONE_OF_EACH_SKU,
    name: 'Все реактивы по 1 шт',
    priceRub: 3990,
    shortDescription: 'Все реактивы каталога, каждого по 1 шт',
  },
]

export interface PriceChange {
  slug: string
  from: number
  to: number
  compareAtFrom: number | null
  compareAtTo: number | null
}

export interface ComboOutcome {
  slug: string
  action: 'created' | 'price-updated'
  priceRub: number
  compareAtPriceRub: number | null
  isPublished: boolean
}

export interface PricesAndCombosReport {
  dryRun: boolean
  // Значения до записи — сохраните вывод: по нему делается откат.
  priceChanges: PriceChange[]
  combos: ComboOutcome[]
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Блок «Состав» в формате, который читает вкладка витрины (ContentsSection). */
export function fourKitsContentsBlock(kitNames: readonly string[]): Block {
  const list = kitNames.map((n) => `<li>${escapeHtml(n)}</li>`).join('')
  return { type: 'paragraph', html: `<h3>Состав</h3><ul>${list}</ul>` } as Block
}

// Статус комбо — худший из статусов входящего: нет хоть одного набора — нет и комбо.
function comboStockStatus(statuses: StockStatus[]): StockStatus {
  if (statuses.includes('out_of_stock')) return 'out_of_stock'
  if (statuses.includes('preorder')) return 'preorder'
  return 'in_stock'
}

function compareAtFor(priceRub: number, sumRub: number): number | null {
  return sumRub > priceRub ? sumRub : null
}

async function liveBySlugs(
  em: EntityManager,
  slugs: readonly string[],
): Promise<Map<string, Product>> {
  const rows = await em.find(Product, {
    where: { slug: In([...slugs]), deletedAt: IsNull() },
    relations: { images: true },
  })
  return new Map(rows.map((p) => [p.slug, p]))
}

function mustGet(map: Map<string, Product>, slug: string): Product {
  const p = map.get(slug)
  if (!p) throw new Error(`Товар ${slug} не найден в БД`)
  return p
}

function sortedImages(p: Product): ProductImage[] {
  return [...(p.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
}

async function reagentsSumRub(em: EntityManager): Promise<number> {
  const rows: { sum: string | null }[] = await em.query(
    `SELECT SUM(p.price_rub) AS sum
       FROM products p
       JOIN product_category_links l ON l.product_id = p.id
       JOIN product_categories c ON c.id = l.category_id
      WHERE c.slug = $1 AND p.is_published AND p.deleted_at IS NULL
        AND NOT (p.slug = ANY($2))`,
    [REAGENTS_CATEGORY_SLUG, [...REAGENT_COMBO_SLUGS]],
  )
  return Number(rows[0]?.sum ?? 0)
}

// Одна транзакция: либо всё, либо ничего.
export async function applyPricesAndCombos(
  dataSource: DataSource,
  options: { dryRun?: boolean; publish?: boolean } = {},
): Promise<PricesAndCombosReport> {
  const dryRun = options.dryRun === true
  const publish = options.publish === true
  return dataSource.transaction(async (em) => {
    const report: PricesAndCombosReport = { dryRun, priceChanges: [], combos: [] }

    // 1. Цены существующих наборов.
    const kits = await liveBySlugs(em, Object.keys(KIT_PRICES))
    for (const [slug, to] of Object.entries(KIT_PRICES)) {
      const p = mustGet(kits, slug)
      const compareAtTo =
        p.compareAtPriceRub !== null && p.compareAtPriceRub > to ? p.compareAtPriceRub : null
      report.priceChanges.push({
        slug,
        from: p.priceRub,
        to,
        compareAtFrom: p.compareAtPriceRub,
        compareAtTo,
      })
      if (!dryRun) await em.update(Product, p.id, { priceRub: to, compareAtPriceRub: compareAtTo })
    }

    // 2. Новые комбо.
    const combo = await em.findOne(ProductCategory, { where: { slug: COMBO_CATEGORY_SLUG } })
    if (!combo) throw new Error(`Категория ${COMBO_CATEGORY_SLUG} не найдена в БД`)
    const sources = await liveBySlugs(em, [...FOUR_KITS_COMPONENTS, ALL_REAGENTS_SOURCE_SLUG])
    const components = FOUR_KITS_COMPONENTS.map((s) => mustGet(sources, s))
    const reserve = mustGet(sources, ALL_REAGENTS_SOURCE_SLUG)

    for (const spec of NEW_COMBOS) {
      const isFour = spec.slug === FOUR_KITS_SLUG
      const sumRub = isFour
        ? FOUR_KITS_COMPONENTS.reduce((n, s) => n + KIT_PRICES[s], 0)
        : await reagentsSumRub(em)
      const compareAtPriceRub = compareAtFor(spec.priceRub, sumRub)

      const existing = await em.findOne(Product, { where: { slug: spec.slug }, withDeleted: true })
      if (existing?.deletedAt) {
        throw new Error(
          `Товар ${spec.slug} удалён (deleted_at); восстановите его в админке или удалите строку — скрипт его не воскрешает`,
        )
      }
      if (existing) {
        if (!dryRun) {
          await em.update(Product, existing.id, { priceRub: spec.priceRub, compareAtPriceRub })
        }
        report.combos.push({
          slug: spec.slug,
          action: 'price-updated',
          priceRub: spec.priceRub,
          compareAtPriceRub,
          isPublished: existing.isPublished,
        })
        continue
      }

      const rule = SHIPPING_OVERRIDES[spec.slug] ?? {}
      const images: { url: string; alt: string }[] = isFour
        ? components.flatMap((k) => {
            const first = sortedImages(k)[0]
            return first ? [{ url: first.url, alt: k.name }] : []
          })
        : sortedImages(reserve).map((img) => ({ url: img.url, alt: spec.name }))

      report.combos.push({
        slug: spec.slug,
        action: 'created',
        priceRub: spec.priceRub,
        compareAtPriceRub,
        isPublished: publish,
      })
      if (dryRun) continue

      const created = await em.save(
        em.create(Product, {
          slug: spec.slug,
          sku: spec.sku,
          name: spec.name,
          shortDescription: spec.shortDescription,
          longDescriptionBlocks: isFour
            ? [fourKitsContentsBlock(components.map((k) => k.name))]
            : [],
          priceRub: spec.priceRub,
          compareAtPriceRub,
          stockStatus: isFour
            ? comboStockStatus(components.map((k) => k.stockStatus))
            : reserve.stockStatus,
          isPublished: publish,
          sortOrder: isFour ? mustGet(kits, 'vse-tri-nabora').sortOrder : reserve.sortOrder,
          ogImage: images[0]?.url ?? null,
          weightG: isFour
            ? (rule.weightG ?? null)
            : reserve.weightG
              ? Math.round(reserve.weightG / 2)
              : null,
          shipBoxes: rule.shipBoxes ?? [],
          looseUnits: rule.looseUnits ?? 1,
          minBox: rule.minBox ?? null,
        }),
      )
      // Связь «категория — товары» хранит сторона категории (@JoinTable там).
      await em.createQueryBuilder().relation(ProductCategory, 'products').of(combo).add(created.id)
      if (images.length > 0) {
        await em.save(
          images.map((img, i) =>
            em.create(ProductImage, {
              productId: created.id,
              url: img.url,
              alt: img.alt,
              sortOrder: i,
            }),
          ),
        )
      }
    }
    return report
  })
}
