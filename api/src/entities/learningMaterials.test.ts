import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { seedOrder } from '../routes/testUtils.js'
import { LearningMaterial } from './LearningMaterial.js'
import { MaterialGrant } from './MaterialGrant.js'

const materials = () => AppDataSource.getRepository(LearningMaterial)
const grants = () => AppDataSource.getRepository(MaterialGrant)

const fileMaterial = (over: Partial<LearningMaterial> = {}) =>
  materials().save(
    materials().create({
      title: 'Методичка',
      kind: 'file',
      fileKey: 'a.pdf',
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      ...over,
    }),
  )

describe('таблицы материалов', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE material_grants, learning_material_products, learning_materials, orders RESTART IDENTITY CASCADE',
    )
  })

  it('сохраняет файл и читает обратно со значениями по умолчанию', async () => {
    const m = await fileMaterial()
    const saved = await materials().findOneByOrFail({ id: m.id })
    expect(saved).toMatchObject({
      kind: 'file',
      fileKey: 'a.pdf',
      isActive: true,
      externalUrl: null,
      sizeBytes: 10,
    })
  })

  it('файл без file_key и ссылка без external_url отклоняются CHECK-ом', async () => {
    await expect(fileMaterial({ fileKey: null })).rejects.toThrow(/CHK_learning_materials_payload/)
    await expect(
      materials().save(materials().create({ title: 'Ссылка', kind: 'link', externalUrl: null })),
    ).rejects.toThrow(/CHK_learning_materials_payload/)
  })

  it('file_key уникален среди файлов, ссылки с пустым file_key не конфликтуют', async () => {
    await fileMaterial()
    await expect(fileMaterial()).rejects.toThrow(/UQ_learning_materials_file_key/)
    for (const n of [1, 2]) {
      await materials().save(
        materials().create({
          title: `Ссылка ${n}`,
          kind: 'link',
          externalUrl: `https://example.com/${n}`,
        }),
      )
    }
    expect(await materials().count()).toBe(3)
  })

  it('выдача за заказ уникальна по (заказ, материал); выдачи без заказа не конфликтуют', async () => {
    const m = await fileMaterial()
    const order = await seedOrder()
    const grant = (over: Partial<MaterialGrant>) =>
      grants().save(grants().create({ materialId: m.id, source: 'order', ...over }))

    await grant({ orderId: order.id })
    await expect(grant({ orderId: order.id })).rejects.toThrow(/UQ_material_grants_order_material/)

    await grant({ email: 'a@example.com', source: 'admin' })
    await grant({ email: 'a@example.com', source: 'admin' })
    expect(await grants().count()).toBe(3)
  })
})
