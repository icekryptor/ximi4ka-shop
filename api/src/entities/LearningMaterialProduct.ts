import 'reflect-metadata'
import { Entity, PrimaryColumn } from 'typeorm'

// Какой товар даёт какой материал при оплате.
@Entity({ name: 'learning_material_products' })
export class LearningMaterialProduct {
  @PrimaryColumn('uuid', { name: 'material_id' })
  materialId!: string

  @PrimaryColumn('uuid', { name: 'product_id' })
  productId!: string
}
