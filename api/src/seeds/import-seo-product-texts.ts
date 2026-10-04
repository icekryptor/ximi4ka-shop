// Импорт SEO-черновиков карточек товаров (metaTitle, metaDescription, длинное
// описание + FAQ) из committed api/data/seo-product-texts.json в БД.
//
// Flags:
//   --dry-run                  читает БД, печатает, что было бы заполнено, но ничего не пишет;
//   --include-drafts           импортировать и записи с draft: true (по умолчанию они
//                              пропускаются: тексты сначала проверяет владелец);
//   --append-long-description  если у товара уже есть описание — дописать SEO-блоки
//                              после него (по умолчанию непустое описание не трогается).
//
// Импорт идемпотентен и только ЗАПОЛНЯЕТ ПУСТЫЕ поля: то, что уже есть в БД
// (в том числе правки из админки), не перезаписывается. Товар ищется по slug;
// неизвестные slug пропускаются с отчётом. Логика — в _lib/seo-product-texts.ts.
import 'reflect-metadata'
import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pino from 'pino'
import type { SeoProductText } from './_lib/seo-product-texts.js'

const logger = pino().child({ mod: 'import-seo-product-texts' })

// api/ package root (this file lives at api/src/seeds/).
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SEO_TEXTS_PATH = path.join(API_ROOT, 'data', 'seo-product-texts.json')

interface CliArgs {
  dryRun: boolean
  includeDrafts: boolean
  appendLongDescription: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false, includeDrafts: false, appendLongDescription: false }
  for (const a of argv) {
    if (a === '--dry-run') {
      args.dryRun = true
    } else if (a === '--include-drafts') {
      args.includeDrafts = true
    } else if (a === '--append-long-description') {
      args.appendLongDescription = true
    } else {
      console.error(`unknown argument: ${a}`)
      console.error(
        'Usage: tsx import-seo-product-texts.ts [--dry-run] [--include-drafts] [--append-long-description]',
      )
      process.exit(2)
    }
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const entries = JSON.parse(await readFile(SEO_TEXTS_PATH, 'utf-8')) as SeoProductText[]

  console.log('')
  console.log('=== SEO product texts import ===')
  console.log(
    `Mode:    ${args.dryRun ? 'DRY RUN (БД читается, не пишется)' : 'LIVE (fill empty only)'}`,
  )
  console.log(`Source:  ${SEO_TEXTS_PATH}`)
  console.log(`Entries: ${entries.length}`)
  console.log(`Drafts:  ${args.includeDrafts ? 'включены (--include-drafts)' : 'пропускаются'}`)
  console.log(
    `Append:  ${args.appendLongDescription ? 'дописывать к существующему описанию' : 'нет'}`,
  )
  console.log('')

  // Lazy-load DB modules so a bad argument fails before connecting.
  const { AppDataSource } = await import('../config/dataSource.js')
  const { Product } = await import('../entities/Product.js')
  const { applySeoProductTexts } = await import('./_lib/seo-product-texts.js')

  await AppDataSource.initialize()
  try {
    const report = await applySeoProductTexts(AppDataSource.getRepository(Product), entries, {
      includeDrafts: args.includeDrafts,
      appendLongDescription: args.appendLongDescription,
      dryRun: args.dryRun,
    })

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
        filledProducts: report.filled.length,
        untouchedProducts: report.untouched.length,
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
