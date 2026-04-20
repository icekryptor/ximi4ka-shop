import 'reflect-metadata'
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm'

@Entity({ name: 'pages' })
export class Page {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 255, unique: true })
  slug!: string

  @Column({ type: 'varchar', length: 500 })
  title!: string

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  blocks!: unknown[]

  @Column({ type: 'varchar', length: 255, name: 'meta_title', nullable: true })
  metaTitle!: string | null

  @Column({ type: 'text', name: 'meta_description', nullable: true })
  metaDescription!: string | null

  @Column({ type: 'varchar', length: 500, name: 'og_image', nullable: true })
  ogImage!: string | null

  @Column({ type: 'varchar', length: 500, name: 'canonical_url', nullable: true })
  canonicalUrl!: string | null

  @Column({ type: 'boolean', default: false })
  noindex!: boolean

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  translations!: Record<string, unknown>

  @Column({ type: 'boolean', name: 'is_published', default: false })
  isPublished!: boolean

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null
}
