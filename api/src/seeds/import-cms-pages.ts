// Импорт CMS-страниц со старого сайта на Tilda (policy, oferta, collab, cert,
// faq и др.) из api/data/cms-pages.json в таблицу pages.
//
// Страницы — цели 301-редиректов из tilda-redirects.csv (/policy2 → /policy и
// т.д.); пока их нет, эти редиректы ведут в 404. Контент в JSON перенесён с
// публичных страниц Tilda, ссылки на картинки оставлены как на static.tildacdn.com.
//
// Флаги:
//   --dry-run   вывести план, без записи в БД.
//
// Сид идемпотентный и безопасный для правок админки: создаются только
// отсутствующие страницы (по slug), существующие и удалённые не трогаются.
import 'reflect-metadata'
import 'dotenv/config'
import pino from 'pino'
import { createMissingPages, readCmsPages, CMS_PAGES_JSON_PATH } from './_lib/cms-pages.js'

const logger = pino().child({ mod: 'import-cms-pages' })

function parseArgs(argv: string[]): { dryRun: boolean } {
  const args = { dryRun: false }
  for (const a of argv) {
    if (a === '--dry-run') {
      args.dryRun = true
    } else {
      console.error(`unknown argument: ${a}`)
      console.error('Usage: tsx import-cms-pages.ts [--dry-run]')
      process.exit(2)
    }
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const entries = await readCmsPages()

  console.log('')
  console.log('=== Tilda CMS pages import ===')
  console.log(`Mode:    ${args.dryRun ? 'DRY RUN (no writes)' : 'LIVE (create missing by slug)'}`)
  console.log(`Source:  ${CMS_PAGES_JSON_PATH}`)
  for (const e of entries) {
    const counts = new Map<string, number>()
    for (const b of e.blocks) counts.set(b.type, (counts.get(b.type) ?? 0) + 1)
    const summary = [...counts.entries()].map(([t, n]) => `${t}:${n}`).join(' ')
    console.log(`  /${e.slug.padEnd(16)} [${summary}]${e.noindex ? ' noindex' : ''}`)
  }
  console.log('')

  if (args.dryRun) {
    console.log('Dry-run complete — no DB writes.')
    return
  }

  // Lazy-load DB modules so --dry-run works without DATABASE_URL set.
  const { AppDataSource } = await import('../config/dataSource.js')
  const { Page } = await import('../entities/Page.js')

  await AppDataSource.initialize()
  try {
    const result = await createMissingPages(AppDataSource.getRepository(Page), entries)
    logger.info({ ...result, total: entries.length }, 'cms pages imported')
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((err) => {
  logger.error({ err }, 'import failed')
  process.exit(1)
})
