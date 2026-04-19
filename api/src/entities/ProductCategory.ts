import 'reflect-metadata'
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
  OneToMany,
} from 'typeorm'
import { Product } from './Product.js'

@Entity({ name: 'product_categories' })
export class ProductCategory {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 255, unique: true })
  slug!: string

  @Column({ type: 'varchar', length: 255 })
  name!: string

  @Column({ type: 'uuid', name: 'parent_id', nullable: true })
  parentId!: string | null

  @ManyToOne(() => ProductCategory, (c) => c.children, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent!: ProductCategory | null

  @OneToMany(() => ProductCategory, (c) => c.parent)
  children!: ProductCategory[]

  @Column({ type: 'varchar', length: 255, name: 'meta_title', nullable: true })
  metaTitle!: string | null

  @Column({ type: 'text', name: 'meta_description', nullable: true })
  metaDescription!: string | null

  @Column({ type: 'integer', name: 'sort_order', default: 0 })
  sortOrder!: number

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  translations!: Record<string, unknown>

  @ManyToMany(() => Product, (p) => p.categories)
  @JoinTable({
    name: 'product_category_links',
    joinColumn: { name: 'category_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'product_id', referencedColumnName: 'id' },
  })
  products!: Product[]
}
