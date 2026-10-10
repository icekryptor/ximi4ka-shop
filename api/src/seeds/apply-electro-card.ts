// Одноразовое обновление карточки «Электрохимичка» (slug elektrohimichka):
// дописывает в описание блоки «Состав» и «Характеристики». Идемпотентно.
// Содержимое — в _lib/electro-card.ts.
//
// Flags:
//   --dry-run  читает БД и печатает, что было бы заменено, но ничего не пишет.
//
// В боевом режиме печатает значение «до» — сохраните вывод: по нему делается откат.
import 'reflect-metadata'
import 'dotenv/config'
import pino from 'pino'

const logger = pino().child({ mod: 'apply-electro-card' })

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const unknown = args.filter((a) => a !== '--dry-run')
  if (unknown.length > 0) {
    console.error(`unknown argument: ${unknown.join(' ')}`)
    console.error('Usage: tsx apply-electro-card.ts [--dry-run]')
    process.exit(2)
  }
  const dryRun = args.includes('--dry-run')

  const { AppDataSource } = await import('../config/dataSource.js')
  const { applyElectroCard, ELECTRO_SLUG } = await import('./_lib/electro-card.js')

  await AppDataSource.initialize()
  try {
    const report = await applyElectroCard(AppDataSource, { dryRun })
    logger.info({ slug: ELECTRO_SLUG, before: report.before }, 'значения до замены (для отката)')
    logger.info(
      { slug: ELECTRO_SLUG },
      dryRun ? 'dry-run — в БД ничего не записано' : 'карточка обновлена',
    )
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((err) => {
  logger.error({ err }, 'apply-electro-card failed')
  process.exit(1)
})
