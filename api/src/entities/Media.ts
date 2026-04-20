import 'reflect-metadata'
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm'

@Entity({ name: 'media' })
@Index(['createdAt'])
export class Media {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 500 })
  url!: string

  @Column({ type: 'varchar', length: 255 })
  filename!: string

  @Column({ type: 'varchar', length: 128, name: 'mime_type' })
  mimeType!: string

  @Column({ type: 'integer' })
  size!: number

  @Column({ type: 'integer', nullable: true })
  width!: number | null

  @Column({ type: 'integer', nullable: true })
  height!: number | null

  @Column({ type: 'uuid', name: 'uploaded_by', nullable: true })
  uploadedBy!: string | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date
}
