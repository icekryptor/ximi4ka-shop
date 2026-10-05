// Импорт SEO-черновиков категорий (metaTitle, metaDescription, SEO-текст и FAQ
// под сеткой товаров) из committed api/data/seo-category-texts.json в БД.
//
// Flags:
//   --dry-run         читает БД, печатает, что было бы заполнено, но ничего не пишет;
//   --include-drafts  импортировать и записи с draft: true (по умолчанию они
//                     пропускаются: тексты сначала проверяет владелец).
//
// Импорт идемпотентен и только ЗАПОЛНЯЕТ ПУСТЫЕ поля: то, что уже есть в БД
// (в том числе правки из админки), не перезаписывается. Категория ищется по
// slug; неизвестные slug пропускаются с отчётом. Логика — в _lib/seo-category-texts.ts.
import 'reflect-metadata'
import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pino from 'pino'
import type { SeoCategoryText } from './_lib/seo-category-texts.js'

const logger = pino().child({ mod: 'import-seo-category-texts' })

// api/ package root (this file lives at api/src/seeds/).
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SEO_TEXTS_PATH = path.join(API_ROOT, 'data', 'seo-category-texts.json')

interface CliArgs {
  dryRun: boolean
  includeDrafts: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false, includeDrafts: false }
  for (const a of argv) {
    if (a === '--dry-run') {
      args.dryRun = true
    } else if (a === '--include-drafts') {
      args.includeDrafts = true
    } else {
      console.error(`unknown argument: ${a}`)
      console.error('Usage: tsx import-seo-category-texts.ts [--dry-run] [--include-drafts]')
      process.exit(2)
    }
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const entries = JSON.parse(await readFile(SEO_TEXTS_PATH, 'utf-8')) as SeoCategoryText[]

  console.log('')
  console.log('=== SEO category texts import ===')
  console.log(
    `Mode:    ${args.dryRun ? 'DRY RUN (БД читается, не пишется)' : 'LIVE (fill empty only)'}`,
  )
  console.log(`Source:  ${SEO_TEXTS_PATH}`)
  console.log(`Entries: ${entries.length}`)
  console.log(`Drafts:  ${args.includeDrafts ? 'включены (--include-drafts)' : 'пропускаются'}`)
  console.log('')

  // Lazy-load DB modules so a bad argument fails before connecting.
  const { AppDataSource } = await import('../config/dataSource.js')
  const { ProductCategory } = await import('../entities/ProductCategory.js')
  const { applySeoCategoryTexts } = await import('./_lib/seo-category-texts.js')

  await AppDataSource.initialize()
  try {
    const report = await applySeoCategoryTexts(
      AppDataSource.getRepository(ProductCategory),
      entries,
      { includeDrafts: args.includeDrafts, dryRun: args.dryRun },
    )

    // Что именно заполнено — сохраните вывод: по нему делается откат.
    for (const f of report.filled) {
      logger.info({ slug: f.slug, fields: f.fields }, args.dryRun ? 'would fill' : 'filled')
    }
    for (const u of report.untouched) {
      logger.info({ slug: u.slug, fields: u.fields }, 'already set — left as is')
    }
    if (report.unknown.length > 0) {
      logger.warn({ slugs: report.unknown }, 'unknown slugs (not in DB) — skipped')
    }
    if (report.drafts.length > 0) {
      logger.warn(
        { count: report.drafts.length },
        'draft entries skipped — pass --include-drafts after the owner has reviewed the texts',
      )
    }
    logger.info(
      {
        filledCategories: report.filled.length,
        untouchedCategories: report.untouched.length,
        unknown: report.unknown.length,
        drafts: report.drafts.length,
      },
      args.dryRun ? 'dry-run complete — no DB writes' : 'import complete',
    )
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((err) => {
  logger.error({ err }, 'import failed')
  process.exit(1)
})
