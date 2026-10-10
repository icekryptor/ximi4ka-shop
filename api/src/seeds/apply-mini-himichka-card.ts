// Одноразовое обновление карточки «Мини-Химичка» (slug mini-himichka): дописывает
// блоки «Состав» и «Характеристики», остальное описание не трогает. Идемпотентно.
// Содержимое — в _lib/mini-himichka-card.ts.
//
// Flags:
//   --dry-run  читает БД и печатает значения «до», но ничего не пишет.
//
// Печатает значения «до» — сохраните вывод: по нему делается откат.
import 'reflect-metadata'
import 'dotenv/config'
import pino from 'pino'

const logger = pino().child({ mod: 'apply-mini-himichka-card' })

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const unknown = args.filter((a) => a !== '--dry-run')
  if (unknown.length > 0) {
    console.error(`unknown argument: ${unknown.join(' ')}`)
    console.error('Usage: tsx apply-mini-himichka-card.ts [--dry-run]')
    process.exit(2)
  }
  const dryRun = args.includes('--dry-run')

  const { AppDataSource } = await import('../config/dataSource.js')
  const { applyMiniHimichkaCard, MINI_SLUG } = await import('./_lib/mini-himichka-card.js')

  await AppDataSource.initialize()
  try {
    const report = await applyMiniHimichkaCard(AppDataSource, { dryRun })
    logger.info({ slug: MINI_SLUG, before: report.before }, 'значения до записи (для отката)')
    logger.info(
      { slug: MINI_SLUG },
      dryRun ? 'dry-run — в БД ничего не записано' : 'карточка обновлена',
    )
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((err) => {
  logger.error({ err }, 'apply-mini-himichka-card failed')
  process.exit(1)
})
