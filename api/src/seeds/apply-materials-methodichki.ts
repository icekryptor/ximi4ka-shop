// Одноразовое заведение трёх электронных методичек в каталог материалов
// (learning_materials) и выдача их уже оплаченным заказам. Идемпотентно.
// Файлы himichka.pdf, elektrohimichka.pdf, oge-2026.pdf должны лежать в
// MATERIALS_DIR (на проде — том ximishop-materials, см. deploy/MATERIALS.md).
//
// Flags:
//   --dry-run  делает всё в транзакции и откатывает: печатает отчёт, ничего не пишет.
import 'reflect-metadata'
import 'dotenv/config'
import pino from 'pino'

const logger = pino().child({ mod: 'apply-materials-methodichki' })

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const unknown = args.filter((a) => a !== '--dry-run')
  if (unknown.length > 0) {
    console.error(`unknown argument: ${unknown.join(' ')}`)
    console.error('Usage: tsx apply-materials-methodichki.ts [--dry-run]')
    process.exit(2)
  }
  const dryRun = args.includes('--dry-run')

  const { AppDataSource } = await import('../config/dataSource.js')
  const { applyMethodichkiMaterials } = await import('./_lib/methodichki-materials.js')
  const { materialsDir } = await import('../lib/materials/files.js')

  await AppDataSource.initialize()
  try {
    const dir = materialsDir()
    const report = await applyMethodichkiMaterials(AppDataSource, { dryRun, materialsDir: dir })
    logger.info(
      { dir, report },
      dryRun ? 'dry-run — в БД ничего не записано' : 'материалы заведены',
    )
    if (report.missingFiles.length > 0) {
      logger.warn(
        { missingFiles: report.missingFiles },
        'файлов нет в каталоге — эти материалы пропущены',
      )
      process.exitCode = 1
    }
    if (report.missingSlugs.length > 0) {
      logger.warn({ missingSlugs: report.missingSlugs }, 'товаров с такими slug нет в каталоге')
    }
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((err) => {
  logger.error({ err }, 'apply-materials-methodichki failed')
  process.exit(1)
})
