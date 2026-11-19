// Одноразово: новые цены наборов и комбо «Все четыре набора» и «Все реактивы
// по 1 шт» (решение владельца от 09.11.2026). Что именно меняется — в
// _lib/prices-and-combos.ts. Идемпотентно.
//
// Flags:
//   --dry-run  читает БД и печатает план, но ничего не пишет.
//   --publish  новые товары сразу опубликованы (по умолчанию — черновики).
//
// Печатает значения «до» — сохраните вывод: по нему делается откат.
import 'reflect-metadata'
import 'dotenv/config'
import pino from 'pino'

const logger = pino().child({ mod: 'apply-prices-and-combos' })
const FLAGS = ['--dry-run', '--publish']

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const unknown = args.filter((a) => !FLAGS.includes(a))
  if (unknown.length > 0) {
    console.error(`unknown argument: ${unknown.join(' ')}`)
    console.error('Usage: tsx apply-prices-and-combos.ts [--dry-run] [--publish]')
    process.exit(2)
  }
  const dryRun = args.includes('--dry-run')
  const publish = args.includes('--publish')

  const { AppDataSource } = await import('../config/dataSource.js')
  const { applyPricesAndCombos } = await import('./_lib/prices-and-combos.js')

  await AppDataSource.initialize()
  try {
    const report = await applyPricesAndCombos(AppDataSource, { dryRun, publish })
    for (const c of report.priceChanges) {
      logger.info(c, 'цена набора (from/compareAtFrom — значения до записи, для отката)')
    }
    for (const c of report.combos) logger.info(c, 'комбо')
    logger.info(dryRun ? 'dry-run — в БД ничего не записано' : 'цены и комбо записаны')
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((err) => {
  logger.error({ err }, 'apply-prices-and-combos failed')
  process.exit(1)
})
