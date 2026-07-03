// Import the real ximi4ka.ru (Tilda) catalog into the shop database.
//
// Two input modes:
//   --crawl <dir>   extract from a raw crawl (<dir>/products.tsv + <dir>/pages/*.html),
//                   refresh api/data/tilda-catalog.json + api/data/tilda-product-map.json,
//                   then import into the DB;
//   (no --crawl)    import from the committed api/data/tilda-catalog.json.
//
// Flags:
//   --replace-dev-seed  soft-delete the 8 dev products from seeds/seed.ts and
//                       hard-delete the 3 dev categories so the catalog
//                       contains only the real products;
//   --dry-run           extract + print the plan, no DB writes and no data-file writes.
//
// The import is idempotent: categories and products are upserted by slug
// (soft-deleted products with a matching slug are restored), images are
// replaced wholesale on every run.
import 'reflect-metadata'
import 'dotenv/config'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pino from 'pino'
import type { ProductCategory as ProductCategoryType } from '../entities/ProductCategory.js'
import type { ParagraphBlock } from './_lib/tilda-row.js'
import {
  CATALOG_CATEGORIES,
  type CatalogCategorySlug,
  type TildaProductJson,
  assertUniqueSlugs,
  cleanProductName,
  extractOgDescription,
  extractProductJson,
  parseProductsTsv,
  parseTildaPrice,
  parseTproductUrl,
  resolveCategorySlug,
  resolveProductSlug,
  textToParagraphBlocks,
} from './_lib/tilda-crawl.js'

const logger = pino().child({ mod: 'import-tilda-catalog' })

// api/ package root (this file lives at api/src/seeds/).
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATA_DIR = path.join(API_ROOT, 'data')
const CATALOG_JSON_PATH = path.join(DATA_DIR, 'tilda-catalog.json')
const PRODUCT_MAP_PATH = path.join(DATA_DIR, 'tilda-product-map.json')

// Slugs seeded by seeds/seed.ts — placeholder dev products that must not
// coexist with the real catalog. Removed (softly) with --replace-dev-seed.
const DEV_SEED_PRODUCT_SLUGS = [
  'nabor-yunogo-himika',
  'vulkan-lavy',
  'kristalli-cvetnye',
  'slizni-razum',
  'milokon',
  'elektroliz-nabor',
  'nabor-pochvy',
  'molekuly-3d',
]

// Dev-seed categories: product_categories has no soft-delete column, so these
// are hard-deleted (the category_id FK on product_category_links is ON DELETE
// CASCADE). Only their soft-deleted dev products reference them.
const DEV_SEED_CATEGORY_SLUGS = [
  'himicheskie-nabory',
  'eksperimentalnye-nabory',
  'obrazovatelnye-materialy',
]

interface CatalogEntry {
  tildaId: string
  slug: string
  name: string
  // Original SEO H1 (`Купить … | …`) when `name` was distilled from it; null
  // when the crawled name was already clean. Persisted so the product page can
  // keep the search-optimised <title> while the card shows the clean name.
  metaTitle: string | null
  priceRub: number
  compareAtPriceRub: number | null
  sku: string | null
  shortDescription: string | null
  longDescriptionBlocks: ParagraphBlock[]
  // Original static.tildacdn.com URLs, stored as-is. Re-hosting the images
  // in our own storage is a separate follow-up task.
  images: Array<{ url: string; alt: string }>
  categorySlug: CatalogCategorySlug
  sourceUrl: string
}

interface CliArgs {
  crawlDir: string | null
  replaceDevSeed: boolean
  dryRun: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { crawlDir: null, replaceDevSeed: false, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--crawl') {
      const dir = argv[++i]
      if (!dir) {
        console.error('--crawl requires a directory argument')
        process.exit(2)
      }
      args.crawlDir = dir
    } else if (a === '--replace-dev-seed') {
      args.replaceDevSeed = true
    } else if (a === '--dry-run') {
      args.dryRun = true
    } else {
      console.error(`unknown argument: ${a}`)
      console.error(
        'Usage: tsx import-tilda-catalog.ts [--crawl <dir>] [--replace-dev-seed] [--dry-run]',
      )
      process.exit(2)
    }
  }
  return args
}

// ---- Extraction from a raw crawl ----

async function indexPagesByTildaId(pagesDir: string): Promise<Map<string, string>> {
  const byId = new Map<string, string>()
  const files = (await readdir(pagesDir)).filter((f) => f.endsWith('.html'))
  for (const file of files) {
    const html = await readFile(path.join(pagesDir, file), 'utf-8')
    const product = extractProductJson(html)
    if (!product) {
      logger.warn({ file }, 'page has no embedded product JSON — skipping')
      continue
    }
    byId.set(String(product.uid), html)
  }
  return byId
}

async function extractCatalog(crawlDir: string): Promise<CatalogEntry[]> {
  const tsvPath = path.join(crawlDir, 'products.tsv')
  const pagesDir = path.join(crawlDir, 'pages')
  const rows = parseProductsTsv(await readFile(tsvPath, 'utf-8'))
  logger.info({ tsvPath, rows: rows.length }, 'products.tsv parsed')

  const pagesById = await indexPagesByTildaId(pagesDir)
  logger.info({ pagesDir, pages: pagesById.size }, 'product pages indexed')

  const entries: CatalogEntry[] = []
  for (const row of rows) {
    const ref = parseTproductUrl(row.url)
    if (!ref) throw new Error(`not a tproduct URL in products.tsv: ${row.url}`)
    const slug = resolveProductSlug(ref)

    const html = pagesById.get(ref.tildaId)
    if (!html) throw new Error(`no crawled page for tilda id ${ref.tildaId} (${slug})`)
    const product = extractProductJson(html)
    if (!product) throw new Error(`no product JSON for ${slug}`) // unreachable: indexed above

    // Kits carry the long text in `text`; reagents/equipment often only have
    // the short `descr` — that is exactly what the old product page rendered
    // as its main text block, so use it as the fallback.
    const mainText = product.text || product.descr || null
    const gallery = product.gallery ?? []
    const { name, metaTitle } = cleanProductName(row.name)

    entries.push({
      tildaId: ref.tildaId,
      slug,
      name,
      metaTitle,
      priceRub: row.priceRub,
      compareAtPriceRub: parseTildaPrice(product.priceold),
      sku: product.sku?.trim() || null,
      shortDescription: extractOgDescription(html),
      longDescriptionBlocks: textToParagraphBlocks(mainText),
      images: gallery.map((g) => ({ url: g.img, alt: name })),
      categorySlug: resolveCategorySlug(row.url, slug),
      sourceUrl: row.url,
    })
  }

  assertUniqueSlugs(entries.map((e) => e.slug))
  return entries
}

async function writeDataFiles(entries: CatalogEntry[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(CATALOG_JSON_PATH, `${JSON.stringify(entries, null, 2)}\n`, 'utf-8')
  const map: Record<string, string> = {}
  for (const e of entries) map[e.tildaId] = e.slug
  await writeFile(PRODUCT_MAP_PATH, `${JSON.stringify(map, null, 2)}\n`, 'utf-8')
  logger.info(
    { catalog: CATALOG_JSON_PATH, map: PRODUCT_MAP_PATH, entries: entries.length },
    'data files written',
  )
}

async function readCatalogFromDataFile(): Promise<CatalogEntry[]> {
  const raw = await readFile(CATALOG_JSON_PATH, 'utf-8')
  const entries = JSON.parse(raw) as CatalogEntry[]
  assertUniqueSlugs(entries.map((e) => e.slug))
  // Idempotent name distillation: applying cleanProductName to an already-clean
  // name is a no-op, so this normalises legacy JSON (raw SEO name, no metaTitle)
  // without breaking a JSON that was already regenerated by --crawl.
  for (const e of entries) {
    const { name, metaTitle } = cleanProductName(e.metaTitle ?? e.name)
    e.name = name
    e.metaTitle = metaTitle
    for (const img of e.images) {
      if (!img.alt || img.alt.startsWith('Купить')) img.alt = name
    }
  }
  return entries
}

// ---- DB import ----

async function importCatalog(entries: CatalogEntry[], replaceDevSeed: boolean): Promise<void> {
  // Lazy-load DB modules so --dry-run works without DATABASE_URL set.
  const { AppDataSource } = await import('../config/dataSource.js')
  const { Product } = await import('../entities/Product.js')
  const { ProductCategory } = await import('../entities/ProductCategory.js')
  const { ProductImage } = await import('../entities/ProductImage.js')
  const { In } = await import('typeorm')

  await AppDataSource.initialize()
  try {
    const categoryRepo = AppDataSource.getRepository(ProductCategory)
    const productRepo = AppDataSource.getRepository(Product)
    const imageRepo = AppDataSource.getRepository(ProductImage)

    // Upsert the 5 fixed categories by slug.
    const categoriesBySlug = new Map<CatalogCategorySlug, ProductCategoryType>()
    for (let i = 0; i < CATALOG_CATEGORIES.length; i++) {
      const def = CATALOG_CATEGORIES[i]!
      let category = await categoryRepo.findOne({ where: { slug: def.slug } })
      if (!category) category = categoryRepo.create({ slug: def.slug })
      category.name = def.name
      category.sortOrder = i + 1
      categoriesBySlug.set(def.slug, await categoryRepo.save(category))
    }
    logger.info({ count: categoriesBySlug.size }, 'categories upserted')

    // Upsert products by slug; restore soft-deleted rows on re-import.
    let created = 0
    let updated = 0
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!
      const category = categoriesBySlug.get(e.categorySlug)
      if (!category) throw new Error(`category ${e.categorySlug} missing for ${e.slug}`)

      let product = await productRepo.findOne({ where: { slug: e.slug }, withDeleted: true })
      if (product) {
        updated++
      } else {
        product = productRepo.create({ slug: e.slug })
        created++
      }
      product.name = e.name
      // Preserve the search-optimised H1 as the SEO <title>; only overwrite when
      // we have one so a hand-edited metaTitle in the admin isn't clobbered by a
      // re-import of an already-clean name.
      if (e.metaTitle) product.metaTitle = e.metaTitle
      product.sku = e.sku
      product.shortDescription = e.shortDescription
      product.longDescriptionBlocks = e.longDescriptionBlocks
      product.priceRub = e.priceRub
      product.compareAtPriceRub = e.compareAtPriceRub
      product.stockStatus = 'in_stock'
      product.isPublished = true
      product.sortOrder = i + 1
      product.deletedAt = null
      product.categories = [category]
      product = await productRepo.save(product)

      // Replace images wholesale — keeps re-runs idempotent.
      await imageRepo.delete({ productId: product.id })
      for (let imgIdx = 0; imgIdx < e.images.length; imgIdx++) {
        const img = e.images[imgIdx]!
        await imageRepo.save(
          imageRepo.create({
            productId: product.id,
            url: img.url,
            alt: img.alt,
            sortOrder: imgIdx + 1,
          }),
        )
      }
    }
    logger.info({ created, updated, total: entries.length }, 'products upserted')

    if (replaceDevSeed) {
      const result = await productRepo.softDelete({ slug: In(DEV_SEED_PRODUCT_SLUGS) })
      logger.info(
        { affected: result.affected ?? 0, slugs: DEV_SEED_PRODUCT_SLUGS.length },
        'dev-seed products soft-deleted',
      )
      const catResult = await categoryRepo.delete({ slug: In(DEV_SEED_CATEGORY_SLUGS) })
      logger.info(
        { affected: catResult.affected ?? 0, slugs: DEV_SEED_CATEGORY_SLUGS.length },
        'dev-seed categories deleted',
      )
    }
  } finally {
    await AppDataSource.destroy()
  }
}

function printPlan(entries: CatalogEntry[], args: CliArgs): void {
  const byCategory = new Map<string, number>()
  let withCompareAt = 0
  let images = 0
  for (const e of entries) {
    byCategory.set(e.categorySlug, (byCategory.get(e.categorySlug) ?? 0) + 1)
    if (e.compareAtPriceRub !== null) withCompareAt++
    images += e.images.length
  }
  console.log('')
  console.log('=== Tilda catalog import ===')
  console.log(`Mode:            ${args.dryRun ? 'DRY RUN (no writes)' : 'LIVE (upsert by slug)'}`)
  console.log(`Source:          ${args.crawlDir ? `crawl ${args.crawlDir}` : CATALOG_JSON_PATH}`)
  console.log(`Products:        ${entries.length} (${withCompareAt} with compare-at price)`)
  console.log(`Images:          ${images} (static.tildacdn.com URLs, re-hosting is a follow-up)`)
  console.log(`Replace dev seed: ${args.replaceDevSeed ? `yes (${DEV_SEED_PRODUCT_SLUGS.length} products, ${DEV_SEED_CATEGORY_SLUGS.length} categories)` : 'no'}`)
  for (const c of CATALOG_CATEGORIES) {
    console.log(`  ${c.slug.padEnd(10)} ${String(byCategory.get(c.slug) ?? 0).padStart(3)}  ${c.name}`)
  }
  console.log('')
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  const entries = args.crawlDir
    ? await extractCatalog(path.resolve(args.crawlDir))
    : await readCatalogFromDataFile()

  printPlan(entries, args)

  if (args.dryRun) {
    console.log('Dry-run complete — no DB writes, no data-file writes.')
    return
  }

  // Persist the (possibly re-distilled) catalog so the committed JSON carries
  // clean names + metaTitle whether it came from a fresh crawl or a legacy JSON.
  await writeDataFiles(entries)
  await importCatalog(entries, args.replaceDevSeed)
  logger.info('import complete')
}

main().catch((err) => {
  logger.error({ err }, 'import failed')
  process.exit(1)
})
