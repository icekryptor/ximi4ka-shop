// Одноразовое обновление карточки «Химичка ОГЭ» (slug bolshoi-nabor-dlya-oge):
// заменяет фото в product_images на актуальные и записывает подробное описание
// (состав, характеристики, FAQ). Идемпотентно. Содержимое — в _lib/oge-card.ts.
//
// Flags:
//   --dry-run  читает БД и печатает, что было бы заменено, но ничего не пишет.
//
// В боевом режиме печатает значения «до» — сохраните вывод: по нему делается откат.
import 'reflect-metadata'
import 'dotenv/config'
import pino from 'pino'

const logger = pino().child({ mod: 'apply-oge-card' })

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const unknown = args.filter((a) => a !== '--dry-run')
  if (unknown.length > 0) {
    console.error(`unknown argument: ${unknown.join(' ')}`)
    console.error('Usage: tsx apply-oge-card.ts [--dry-run]')
    process.exit(2)
  }
  const dryRun = args.includes('--dry-run')

  const { AppDataSource } = await import('../config/dataSource.js')
  const { applyOgeCard, OGE_IMAGES, OGE_SLUG } = await import('./_lib/oge-card.js')

  await AppDataSource.initialize()
  try {
    const report = await applyOgeCard(AppDataSource, { dryRun })
    logger.info({ slug: OGE_SLUG, before: report.before }, 'значения до замены (для отката)')
    logger.info(
      { slug: OGE_SLUG, images: OGE_IMAGES.map((i) => i.url) },
      dryRun ? 'dry-run — в БД ничего не записано' : 'карточка обновлена',
    )
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((err) => {
  logger.error({ err }, 'apply-oge-card failed')
  process.exit(1)
})
