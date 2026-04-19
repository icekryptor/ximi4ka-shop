import 'reflect-metadata'
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  ManyToMany,
} from 'typeorm'
import { ProductImage } from './ProductImage.js'
import { ProductCategory } from './ProductCategory.js'
import type { StockStatus } from '@ximi4ka-shop/shared'

@Entity({ name: 'products' })
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 255, unique: true })
  slug!: string

  @Column({ type: 'varchar', length: 64, nullable: true })
  sku!: string | null

  @Column({ type: 'varchar', length: 500 })
  name!: string

  @Column({ type: 'text', name: 'short_description', nullable: true })
  shortDescription!: string | null

  @Column({ type: 'jsonb', name: 'long_description_blocks', default: () => "'[]'::jsonb" })
  longDescriptionBlocks!: unknown[]

  @Column({ type: 'integer', name: 'price_rub' })
  priceRub!: number

  @Column({ type: 'integer', name: 'compare_at_price_rub', nullable: true })
  compareAtPriceRub!: number | null

  @Column({
    type: 'varchar',
    length: 32,
    name: 'stock_status',
    default: 'in_stock',
  })
  stockStatus!: StockStatus

  @Column({ type: 'boolean', name: 'is_published', default: false })
  isPublished!: boolean

  @Column({ type: 'integer', name: 'sort_order', default: 0 })
  sortOrder!: number

  @Column({ type: 'varchar', length: 255, name: 'meta_title', nullable: true })
  metaTitle!: string | null

  @Column({ type: 'text', name: 'meta_description', nullable: true })
  metaDescription!: string | null

  @Column({ type: 'varchar', length: 255, name: 'og_image', nullable: true })
  ogImage!: string | null

  @Column({ type: 'varchar', length: 500, name: 'canonical_url', nullable: true })
  canonicalUrl!: string | null

  @Column({ type: 'boolean', default: false })
  noindex!: boolean

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  translations!: Record<string, unknown>

  @OneToMany(() => ProductImage, (img) => img.product)
  images!: ProductImage[]

  @ManyToMany(() => ProductCategory, (cat) => cat.products)
  categories!: ProductCategory[]

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null
}
