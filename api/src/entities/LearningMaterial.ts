import 'reflect-metadata'
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'
import type { MaterialKind } from '@ximi4ka-shop/shared'

// Электронный материал: файл на закрытом томе (file_key — имя файла внутри
// MATERIALS_DIR) или внешняя ссылка. Не путать с MaterialLead — заявки с /get_materials.
@Entity({ name: 'learning_materials' })
export class LearningMaterial {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 255 })
  title!: string

  @Column({ type: 'varchar', length: 16 })
  kind!: MaterialKind

  @Column({ type: 'varchar', length: 255, name: 'file_key', nullable: true })
  fileKey!: string | null

  @Column({ type: 'varchar', length: 255, name: 'file_name', nullable: true })
  fileName!: string | null

  @Column({ type: 'varchar', length: 127, name: 'mime_type', nullable: true })
  mimeType!: string | null

  @Column({ type: 'integer', name: 'size_bytes', nullable: true })
  sizeBytes!: number | null

  @Column({ type: 'text', name: 'external_url', nullable: true })
  externalUrl!: string | null

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date
}
