import 'reflect-metadata'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AppDataSource } from '../../config/dataSource.js'
import { LearningMaterial } from '../../entities/LearningMaterial.js'
import { MaterialGrant } from '../../entities/MaterialGrant.js'
import { addOrderItem, resetMaterialTables, seedProduct } from '../../lib/materials/testUtils.js'
import { resetAccountTables, seedOrder } from '../../routes/testUtils.js'
import { applyMethodichkiMaterials, METHODICHKI } from './methodichki-materials.js'

describe('applyMethodichkiMaterials', () => {
  let dir: string

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    await resetMaterialTables()
    dir = await mkdtemp(path.join(os.tmpdir(), 'materials-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const writeAll = async () => {
    for (const [i, spec] of METHODICHKI.entries()) {
      await writeFile(path.join(dir, spec.fileKey), 'x'.repeat(10 * (i + 1)))
    }
  }
  const run = (dryRun = false) =>
    applyMethodichkiMaterials(AppDataSource, { dryRun, materialsDir: dir })
  const counts = async () => ({
    materials: await AppDataSource.getRepository(LearningMaterial).count(),
    links: Number(
      (await AppDataSource.query('SELECT count(*) AS n FROM learning_material_products'))[0].n,
    ),
    grants: await AppDataSource.getRepository(MaterialGrant).count(),
  })

  it('заводит три материала с размером с диска и привязывает к найденным товарам', async () => {
    await writeAll()
    for (const slug of [
      'himichka-30',
      'elektrohimichka',
      'bolshoi-nabor-dlya-oge',
      'vse-tri-nabora',
    ]) {
      await seedProduct(slug)
    }

    const report = await run()

    expect(report).toMatchObject({ materials: 3, links: 5, missingFiles: [], backfilled: 0 })
    expect([...report.missingSlugs].sort()).toEqual(
      [
        'elektrometodichka',
        'himichka-i-elektrohimichka',
        'himichka-metodichka',
        'mini-himichka',
        'vse-chetyre-nabora',
      ].sort(),
    )
    const rows = await AppDataSource.getRepository(LearningMaterial).find({
      order: { fileKey: 'ASC' },
    })
    expect(rows.map((r) => [r.fileKey, r.sizeBytes, r.kind, r.isActive])).toEqual([
      ['elektrohimichka.pdf', 20, 'file', true],
      ['himichka.pdf', 10, 'file', true],
      ['oge-2026.pdf', 30, 'file', true],
    ])
    expect(rows.every((r) => r.mimeType === 'application/pdf')).toBe(true)
  })

  it('идемпотентен: повторный запуск ничего не дублирует', async () => {
    await writeAll()
    await seedProduct('himichka-30')

    await run()
    const before = await counts()
    const second = await run()

    expect(await counts()).toEqual(before)
    expect(second.links).toBe(0)
  })

  it('нет файла в каталоге — материал пропущен и назван в отчёте', async () => {
    await writeAll()
    await rm(path.join(dir, 'oge-2026.pdf'))
    await seedProduct('bolshoi-nabor-dlya-oge')

    const report = await run()

    expect(report.missingFiles).toEqual(['oge-2026.pdf'])
    expect(report.materials).toBe(2)
    expect(
      await AppDataSource.getRepository(LearningMaterial).countBy({ fileKey: 'oge-2026.pdf' }),
    ).toBe(0)
  })

  it('выдаёт материалы уже оплаченным и отправленным заказам, неоплаченным — нет', async () => {
    await writeAll()
    const kit = await seedProduct('himichka-30')
    const electro = await seedProduct('elektrohimichka')
    const paid = await seedOrder({ status: 'paid', customerEmail: 'Paid@Example.com' })
    const shipped = await seedOrder({ status: 'shipped' })
    const pending = await seedOrder({ status: 'pending' })
    await addOrderItem(paid.id, kit)
    await addOrderItem(shipped.id, electro)
    await addOrderItem(pending.id, kit)

    const report = await run()

    expect(report.backfilled).toBe(2)
    const rows = await AppDataSource.getRepository(MaterialGrant).find()
    expect(rows.map((r) => r.orderId).sort()).toEqual([paid.id, shipped.id].sort())
    expect(rows.find((r) => r.orderId === paid.id)?.email).toBe('paid@example.com')

    await run()
    expect(await AppDataSource.getRepository(MaterialGrant).count()).toBe(2)
  })

  it('dry-run считает, но ничего не пишет', async () => {
    await writeAll()
    await seedProduct('himichka-30')

    const report = await run(true)

    expect(report.materials).toBe(3)
    expect(await counts()).toEqual({ materials: 0, links: 0, grants: 0 })
  })
})
