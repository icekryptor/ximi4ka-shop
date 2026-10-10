// Одноразовое добавление состава и характеристик в карточку «Химичка 3.0»
// (slug himichka-30). Идемпотентно. Содержимое — в _lib/himichka-30-card.ts.
//
// Flags:
//   --dry-run  читает БД и печатает, что было бы заменено, но ничего не пишет.
//
// В боевом режиме печатает значения «до» — сохраните вывод: по нему делается откат.
import 'reflect-metadata'
import 'dotenv/config'
import pino from 'pino'

const logger = pino().child({ mod: 'apply-himichka-30-composition' })

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const unknown = args.filter((a) => a !== '--dry-run')
  if (unknown.length > 0) {
    console.error(`unknown argument: ${unknown.join(' ')}`)
    console.error('Usage: tsx apply-himichka-30-composition.ts [--dry-run]')
    process.exit(2)
  }
  const dryRun = args.includes('--dry-run')

  const { AppDataSource } = await import('../config/dataSource.js')
  const { applyHimichka30Composition, HIMICHKA_30_SLUG } =
    await import('./_lib/himichka-30-card.js')

  await AppDataSource.initialize()
  try {
    const report = await applyHimichka30Composition(AppDataSource, { dryRun })
    logger.info(
      { slug: HIMICHKA_30_SLUG, before: report.before },
      'значения до замены (для отката)',
    )
    logger.info(
      { slug: HIMICHKA_30_SLUG },
      dryRun ? 'dry-run — в БД ничего не записано' : 'состав и характеристики записаны',
    )
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((err) => {
  logger.error({ err }, 'apply-himichka-30-composition failed')
  process.exit(1)
})
