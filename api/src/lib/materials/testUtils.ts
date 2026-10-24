import { AppDataSource } from '../../config/dataSource.js'
import { LearningMaterial } from '../../entities/LearningMaterial.js'
import { LearningMaterialProduct } from '../../entities/LearningMaterialProduct.js'
import { OrderItem } from '../../entities/OrderItem.js'
import { Product } from '../../entities/Product.js'

// Фикстуры тестов материалов (как routes/testUtils.ts: лежит рядом с кодом,
// в тестах не используется ничего, кроме репозиториев и SQL).

export async function resetMaterialTables(): Promise<void> {
  await AppDataSource.query(
    'TRUNCATE material_grants, learning_material_products, learning_materials, products RESTART IDENTITY CASCADE',
  )
}

export async function seedProduct(slug: string, priceRub = 1500): Promise<Product> {
  const repo = AppDataSource.getRepository(Product)
  return repo.save(
    repo.create({
      slug,
      name: slug,
      priceRub,
      stockStatus: 'in_stock',
      isPublished: true,
      longDescriptionBlocks: [],
      translations: {},
    }),
  )
}

export interface SeedMaterialOptions {
  title: string
  fileKey?: string
  kind?: 'file' | 'link'
  externalUrl?: string
  isActive?: boolean
  products?: Product[]
}

export async function seedMaterial(opts: SeedMaterialOptions): Promise<LearningMaterial> {
  const repo = AppDataSource.getRepository(LearningMaterial)
  const kind = opts.kind ?? 'file'
  const fileKey = opts.fileKey ?? `${opts.title}.pdf`
  const material = await repo.save(
    repo.create(
      kind === 'file'
        ? {
            title: opts.title,
            kind,
            fileKey,
            fileName: fileKey,
            mimeType: 'application/pdf',
            sizeBytes: 5,
            isActive: opts.isActive ?? true,
          }
        : {
            title: opts.title,
            kind,
            externalUrl: opts.externalUrl ?? 'https://example.com/material',
            isActive: opts.isActive ?? true,
          },
    ),
  )
  for (const p of opts.products ?? []) {
    await AppDataSource.getRepository(LearningMaterialProduct).save({
      materialId: material.id,
      productId: p.id,
    })
  }
  return material
}

export async function addOrderItem(
  orderId: string,
  product: Product,
  opts: { isGift?: boolean } = {},
): Promise<OrderItem> {
  return AppDataSource.getRepository(OrderItem).save({
    orderId,
    productId: product.id,
    productSnapshot: { name: product.name, sku: null, priceRub: product.priceRub },
    quantity: 1,
    unitPriceRub: product.priceRub,
    isGift: opts.isGift ?? false,
  })
}
