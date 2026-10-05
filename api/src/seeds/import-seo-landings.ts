// Импорт трёх посадочных страниц из api/data/seo-landings.json в pages:
// /opyty-dlya-detej, /opyty-dlya-detej-v-nachalnoj-shkole,
// /khimicheskie-opyty-dlya-detej.
//
// Flags:
//   --dry-run         подключается к БД только на чтение, печатает, что было бы
//                     создано и что уже есть; ничего не записывает.
//   --include-drafts  импортировать и записи с draft: true. Без флага они
//                     пропускаются (в данных пока все три — черновики), так что
//                     сид запускают только после решения владельца.
//
// Сид идемпотентен и безопасен: создаёт ТОЛЬКО отсутствующие страницы (по slug),
// существующие и мягко удалённые не трогает, всё создаётся с is_published=false
// — страницы видны только в админке. Ничего не публикует.
import 'reflect-metadata'
import 'dotenv/config'
import pino from 'pino'
import { SEO_LANDINGS_PATH, importSeoLandings, loadSeoLandings } from './_lib/seo-landings.js'

const logger = pino().child({ mod: 'import-seo-landings' })

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
      console.error('Usage: tsx import-seo-landings.ts [--dry-run] [--include-drafts]')
      process.exit(2)
    }
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const landings = await loadSeoLandings()

  console.log('')
  console.log('=== SEO landing pages import ===')
  console.log(
    `Mode:    ${args.dryRun ? 'DRY RUN (no writes)' : 'LIVE (create missing, unpublished only)'}`,
  )
  console.log(`Drafts:  ${args.includeDrafts ? 'включены (--include-drafts)' : 'пропускаются'}`)
  console.log(`Source:  ${SEO_LANDINGS_PATH}`)
  console.log('')

  // Lazy-load DB modules so a bad argument fails before touching the DB.
  const { AppDataSource } = await import('../config/dataSource.js')
  const { Page } = await import('../entities/Page.js')

  await AppDataSource.initialize()
  try {
    const result = await importSeoLandings(AppDataSource.getRepository(Page), landings, {
      dryRun: args.dryRun,
      includeDrafts: args.includeDrafts,
    })
    for (const slug of result.created) {
      console.log(`  ${args.dryRun ? 'would create' : 'created     '}  /${slug}`)
    }
    for (const slug of result.skipped) console.log(`  exists, kept  /${slug}`)
    for (const slug of result.draftsHeld) console.log(`  draft, held   /${slug}`)
    console.log('')
    logger.info(
      {
        created: result.created.length,
        skipped: result.skipped.length,
        draftsHeld: result.draftsHeld.length,
        dryRun: args.dryRun,
      },
      args.dryRun ? 'dry-run complete — no DB writes' : 'import complete — unpublished only',
    )
    if (result.draftsHeld.length > 0) {
      logger.warn(
        { draftsHeld: result.draftsHeld.length },
        'draft entries skipped — pass --include-drafts after the owner has reviewed the texts',
      )
    }
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((err) => {
  logger.error({ err }, 'import failed')
  process.exit(1)
})
