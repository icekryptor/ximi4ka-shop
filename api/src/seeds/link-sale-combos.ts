// Одноразово: «Все четыре набора!» и «Запас всех реактивов по 1 шт» — в
// категорию «Комбо» (что и почему — в _lib/sale-combos.ts). Идемпотентно.
// Откат: удалить строки этих товаров из связи категории combo.
//
// Flags:
//   --dry-run  читает БД и печатает план, но ничего не пишет.
import 'reflect-metadata'
import 'dotenv/config'
import pino from 'pino'

const logger = pino().child({ mod: 'link-sale-combos' })

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const unknown = args.filter((a) => a !== '--dry-run')
  if (unknown.length > 0) {
    console.error(`unknown argument: ${unknown.join(' ')}`)
    console.error('Usage: tsx link-sale-combos.ts [--dry-run]')
    process.exit(2)
  }
  const dryRun = args.includes('--dry-run')

  const { AppDataSource } = await import('../config/dataSource.js')
  const { linkSaleCombos } = await import('./_lib/sale-combos.js')

  await AppDataSource.initialize()
  try {
    const report = await linkSaleCombos(AppDataSource, { dryRun })
    for (const r of report) logger.info(r, 'комбо')
    if (report.some((r) => r.action === 'missing')) process.exitCode = 1
    logger.info(dryRun ? 'dry-run — в БД ничего не записано' : 'комбо привязаны к категории')
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((err) => {
  logger.error({ err }, 'link-sale-combos failed')
  process.exit(1)
})
