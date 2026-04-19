import 'reflect-metadata'
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { Product } from './Product.js'

@Entity({ name: 'product_images' })
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'product_id' })
  productId!: string

  @ManyToOne(() => Product, (p) => p.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product

  @Column({ type: 'varchar', length: 500 })
  url!: string

  @Column({ type: 'varchar', length: 255 })
  alt!: string

  @Column({ type: 'integer', name: 'sort_order', default: 0 })
  sortOrder!: number
}
