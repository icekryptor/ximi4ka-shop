// Импорт 10 SEO-черновиков статей блога из api/data/seo-blog-drafts.json
// в blog_posts.
//
// Flags:
//   --dry-run   подключается к БД только на чтение, печатает, что было бы
//               создано и что уже есть; ничего не записывает.
//
// Сид идемпотентен и безопасен: создаёт ТОЛЬКО отсутствующие статьи (по slug),
// существующие и удалённые не трогает, всё создаётся черновиками
// (is_published=false) — видны только в админке. Ничего не публикует.
import 'reflect-metadata'
import 'dotenv/config'
import pino from 'pino'
import {
  SEO_BLOG_DRAFTS_PATH,
  importSeoBlogDrafts,
  loadSeoBlogDrafts,
} from './_lib/seo-blog-drafts.js'

const logger = pino().child({ mod: 'import-seo-blog-drafts' })

interface CliArgs {
  dryRun: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false }
  for (const a of argv) {
    if (a === '--dry-run') {
      args.dryRun = true
    } else {
      console.error(`unknown argument: ${a}`)
      console.error('Usage: tsx import-seo-blog-drafts.ts [--dry-run]')
      process.exit(2)
    }
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const drafts = await loadSeoBlogDrafts()

  console.log('')
  console.log('=== SEO blog drafts import ===')
  console.log(
    `Mode:    ${args.dryRun ? 'DRY RUN (no writes)' : 'LIVE (create missing, drafts only)'}`,
  )
  console.log(`Source:  ${SEO_BLOG_DRAFTS_PATH}`)
  console.log('')

  // Lazy-load DB modules so a bad argument fails before touching the DB.
  const { AppDataSource } = await import('../config/dataSource.js')
  const { BlogPost } = await import('../entities/BlogPost.js')

  await AppDataSource.initialize()
  try {
    const result = await importSeoBlogDrafts(AppDataSource.getRepository(BlogPost), drafts, {
      dryRun: args.dryRun,
    })
    for (const slug of result.created) {
      console.log(`  ${args.dryRun ? 'would create' : 'created     '}  /blog/${slug}`)
    }
    for (const slug of result.skipped) console.log(`  exists, kept  /blog/${slug}`)
    console.log('')
    logger.info(
      { created: result.created.length, skipped: result.skipped.length, dryRun: args.dryRun },
      args.dryRun ? 'dry-run complete — no DB writes' : 'import complete — drafts only',
    )
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((err) => {
  logger.error({ err }, 'import failed')
  process.exit(1)
})
