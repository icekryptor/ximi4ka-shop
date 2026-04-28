import 'reflect-metadata'
import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import pino from 'pino'
import { UPLOADS_DIR } from '../lib/storage/index.js'
import type { ProductCategory as ProductCategoryType } from '../entities/ProductCategory.js'
import { parseTildaCsv } from './_lib/csv-parse.js'
import { parseTildaRow, type ParsedTildaProduct } from './_lib/tilda-row.js'
import { dedupeSlug, slugify } from './_lib/slugify.js'
import { downloadImages } from './_lib/image-download.js'

const logger = pino().child({ mod: 'import-tilda-csv' })

interface CliArgs {
  csvPath: string
  dryRun: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const positional = argv.filter((a) => !a.startsWith('-'))
  const dryRun = argv.includes('--dry-run')
  const csvPath = positional[0]
  if (!csvPath) {
    console.error('Usage: tsx import-tilda-csv.ts <csv-path> [--dry-run]')
    process.exit(2)
  }
  return { csvPath, dryRun }
}

// Known Tilda category names → preferred slugs. Anything else falls back to
// transliterated slugify(name).
const PREFERRED_CATEGORY_SLUGS: Record<string, string> = {
  'Наборы для опытов': 'nabory-dlya-opytov',
  Реактивы: 'reaktivy',
  'Лабораторное оборудование': 'laboratornoe-oborudovanie',
  'Печатная продукция': 'pechatnaya-produktsiya',
  Комбо: 'kombo',
  Новинки: 'novinki',
}

function categorySlugFor(name: string): string {
  return PREFERRED_CATEGORY_SLUGS[name] ?? slugify(name)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const csvPath = path.resolve(args.csvPath)
  logger.info({ csvPath, dryRun: args.dryRun }, 'starting import')

  const text = await readFile(csvPath, 'utf-8')
  const rows = parseTildaCsv(text)
  logger.info({ rowCount: rows.length }, 'CSV parsed')

  // Parse + dedupe slugs.
  const seenSlugs = new Set<string>()
  const products: ParsedTildaProduct[] = []
  let skipped = 0
  for (const row of rows) {
    const parsed = parseTildaRow(row)
    if (!parsed) {
      skipped++
      logger.warn({ row: row.Title }, 'skipping row with empty title')
      continue
    }
    parsed.slug = dedupeSlug(parsed.slug, seenSlugs)
    products.push(parsed)
  }

  // Collect unique category names in first-seen order.
  const categoryOrder: string[] = []
  const categorySet = new Set<string>()
  for (const p of products) {
    for (const name of p.categoryNames) {
      if (!categorySet.has(name)) {
        categorySet.add(name)
        categoryOrder.push(name)
      }
    }
  }

  // Build category → slug map.
  const slugSeenForCats = new Set<string>()
  const categories = categoryOrder.map((name) => {
    const slug = dedupeSlug(categorySlugFor(name), slugSeenForCats)
    return { name, slug }
  })

  // Print plan summary.
  let totalImages = 0
  for (const p of products) totalImages += p.photoUrls.length

  console.log('')
  console.log('=== Tilda CSV import plan ===')
  console.log(`CSV file:      ${csvPath}`)
  console.log(`Mode:          ${args.dryRun ? 'DRY RUN (no writes)' : 'LIVE (will TRUNCATE & insert)'}`)
  console.log(`Rows in file:  ${rows.length}`)
  console.log(`Skipped:       ${skipped}`)
  console.log(`Products:      ${products.length}`)
  console.log(`Categories:    ${categories.length}`)
  console.log(`Images:        ${totalImages}`)
  console.log('')

  console.log('--- Categories ---')
  for (const c of categories) console.log(`  ${c.slug.padEnd(30)} ${c.name}`)
  console.log('')

  console.log('--- Products ---')
  for (const p of products) {
    const cats = p.categoryNames.join(', ')
    const compare = p.compareAtPriceRub ? ` (was ${p.compareAtPriceRub})` : ''
    console.log(
      `  [${p.slug}] ${p.name}\n    price: ${p.priceRub}₽${compare}, photos: ${p.photoUrls.length}, blocks: ${p.longDescriptionBlocks.length}, sku: ${p.sku ?? '—'}\n    categories: ${cats || '—'}`,
    )
  }
  console.log('')

  if (args.dryRun) {
    console.log('Dry-run complete — no DB writes, no downloads.')
    console.log(`Would import ${products.length} products, ${categories.length} categories, ${totalImages} images`)
    return
  }

  // ---- LIVE mode below ----

  console.warn('LIVE MODE: about to TRUNCATE products, product_images, product_categories, product_category_links')
  // Lazy-load DB modules so dry-run works without DATABASE_URL set.
  const { AppDataSource } = await import('../config/dataSource.js')
  const { Product } = await import('../entities/Product.js')
  const { ProductCategory } = await import('../entities/ProductCategory.js')
  const { ProductImage } = await import('../entities/ProductImage.js')
  await AppDataSource.initialize()
  try {
    await AppDataSource.query(
      'TRUNCATE products, product_images, product_categories RESTART IDENTITY CASCADE',
    )
    logger.info('truncated tables')

    const categoryRepo = AppDataSource.getRepository(ProductCategory)
    const productRepo = AppDataSource.getRepository(Product)
    const imageRepo = AppDataSource.getRepository(ProductImage)

    // Insert categories.
    const categoryEntities = new Map<string, ProductCategoryType>()
    for (let i = 0; i < categories.length; i++) {
      const c = categories[i]!
      const saved = await categoryRepo.save(
        categoryRepo.create({ slug: c.slug, name: c.name, sortOrder: i + 1 }),
      )
      categoryEntities.set(c.name, saved)
    }
    logger.info({ count: categoryEntities.size }, 'categories inserted')

    // Insert products.
    for (let i = 0; i < products.length; i++) {
      const p = products[i]!
      const productCats = p.categoryNames
        .map((n) => categoryEntities.get(n))
        .filter((c): c is ProductCategoryType => c !== undefined)

      const product = await productRepo.save(
        productRepo.create({
          slug: p.slug,
          sku: p.sku,
          name: p.name,
          shortDescription: p.shortDescription,
          longDescriptionBlocks: p.longDescriptionBlocks,
          priceRub: p.priceRub,
          compareAtPriceRub: p.compareAtPriceRub,
          stockStatus: 'in_stock',
          isPublished: true,
          sortOrder: i + 1,
          metaTitle: p.metaTitle,
          metaDescription: p.metaDescription,
          categories: productCats,
        }),
      )

      // Download images.
      if (p.photoUrls.length > 0) {
        const downloaded = await downloadImages({
          urls: p.photoUrls,
          slug: p.slug,
          uploadsRoot: UPLOADS_DIR,
          concurrency: 5,
          onError: (url, err) => logger.warn({ url, err: String(err) }, 'image download failed'),
        })
        for (let imgIdx = 0; imgIdx < downloaded.length; imgIdx++) {
          const d = downloaded[imgIdx]!
          await imageRepo.save(
            imageRepo.create({
              productId: product.id,
              url: d.publicUrl,
              alt: p.name,
              sortOrder: imgIdx + 1,
            }),
          )
        }
        logger.info({ slug: p.slug, downloaded: downloaded.length, attempted: p.photoUrls.length }, 'images saved')
      }
    }

    logger.info({ products: products.length, categories: categories.length }, 'import complete')
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((err) => {
  logger.error({ err }, 'import failed')
  process.exit(1)
})
