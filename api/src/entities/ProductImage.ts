import 'reflect-metadata'
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  type Relation,
} from 'typeorm'
import { Product } from './Product.js'

@Entity({ name: 'product_images' })
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'product_id' })
  productId!: string

  // `Relation<...>` (not the bare class) is required here: with
  // emitDecoratorMetadata + ESM, a bare `Product` type emits
  // `__metadata("design:type", Product)` which is evaluated eagerly at class
  // definition and throws a TDZ ReferenceError on the circular
  // Product ↔ ProductImage import when running compiled dist output.
  @ManyToOne(() => Product, (p) => p.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Relation<Product>

  @Column({ type: 'varchar', length: 500 })
  url!: string

  @Column({ type: 'varchar', length: 255 })
  alt!: string

  @Column({ type: 'integer', name: 'sort_order', default: 0 })
  sortOrder!: number
}
