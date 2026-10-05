// Освежение четырёх старых статей блога (мета, автор, блоки в конец) из
// committed api/data/seo-article-refresh.json в blog_posts.
//
// Flags:
//   --dry-run         читает БД, печатает по каждой статье, что было бы заполнено
//                     и дописано, но ничего не пишет;
//   --include-drafts  применять и записи с draft: true (по умолчанию они
//                     пропускаются: тексты сначала проверяет владелец).
//
// Импорт идемпотентен и осторожен: ЗАПОЛНЯЕТ только пустые metaTitle,
// metaDescription, authorName и ДОПИСЫВАЕТ блоки в конец статьи (faq,
// product_grid, «Читайте также»), не дублируя их при повторе. Существующий текст
// и заполненные поля не перезаписываются; updatedAt меняется только у реально
// изменённых статей. Статья ищется по slug; неизвестные и удалённые пропускаются.
// Логика — в _lib/seo-article-refresh.ts.
//
// НЕ запускать import:tilda-articles после этого сида: он пересоздаёт blocks и
// metaDescription из tilda-articles.json и сотрёт дописанные блоки.
import 'reflect-metadata'
import 'dotenv/config'
import pino from 'pino'
import { SEO_ARTICLE_REFRESH_PATH, loadSeoArticleRefresh } from './_lib/seo-article-refresh.js'

const logger = pino().child({ mod: 'import-seo-article-refresh' })

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
      console.error('Usage: tsx import-seo-article-refresh.ts [--dry-run] [--include-drafts]')
      process.exit(2)
    }
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const entries = await loadSeoArticleRefresh()

  console.log('')
  console.log('=== SEO article refresh ===')
  console.log(
    `Mode:    ${args.dryRun ? 'DRY RUN (БД читается, не пишется)' : 'LIVE (fill empty, append blocks)'}`,
  )
  console.log(`Source:  ${SEO_ARTICLE_REFRESH_PATH}`)
  console.log(`Entries: ${entries.length}`)
  console.log(`Drafts:  ${args.includeDrafts ? 'включены (--include-drafts)' : 'пропускаются'}`)
  console.log('')

  // Lazy-load DB modules so a bad argument fails before connecting.
  const { AppDataSource } = await import('../config/dataSource.js')
  const { BlogPost } = await import('../entities/BlogPost.js')
  const { applyArticleRefresh } = await import('./_lib/seo-article-refresh.js')

  await AppDataSource.initialize()
  try {
    const report = await applyArticleRefresh(AppDataSource.getRepository(BlogPost), entries, {
      includeDrafts: args.includeDrafts,
      dryRun: args.dryRun,
    })

    // Что именно заполнено — сохраните вывод вместе со снимком полей до запуска.
    for (const f of report.filled) {
      console.log(`  ${args.dryRun ? 'would fill' : 'filled    '}  /blog/${f.slug}`)
      console.log(`      fields: ${f.fields.join(', ')}`)
      if (f.appendedBlocks.length > 0) {
        console.log(`      blocks appended: ${f.appendedBlocks.join(', ')}`)
      }
    }
    for (const u of report.untouched) {
      console.log(`  kept        /blog/${u.slug}  (already set: ${u.fields.join(', ')})`)
    }
    for (const w of report.warnings) console.log(`  WARNING     /blog/${w.slug}  ${w.message}`)
    for (const slug of report.unknown) {
      console.log(`  NOT FOUND   /blog/${slug}  (нет в БД или удалена) — skipped`)
    }
    if (report.drafts.length > 0) {
      logger.warn(
        { slugs: report.drafts },
        'draft entries skipped — pass --include-drafts after the owner has reviewed the texts',
      )
    }
    console.log('')
    logger.info(
      {
        filledArticles: report.filled.length,
        untouchedArticles: report.untouched.length,
        unknown: report.unknown.length,
        drafts: report.drafts.length,
        warnings: report.warnings.length,
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
