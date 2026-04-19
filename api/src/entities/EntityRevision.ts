import 'reflect-metadata'
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm'

@Entity({ name: 'entity_revisions' })
@Index(['entityType', 'entityId'])
export class EntityRevision {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 64, name: 'entity_type' })
  entityType!: string

  @Column({ type: 'uuid', name: 'entity_id' })
  entityId!: string

  @Column({ type: 'jsonb' })
  snapshot!: Record<string, unknown>

  @Column({ type: 'uuid', name: 'edited_by', nullable: true })
  editedBy!: string | null

  @CreateDateColumn({ name: 'edited_at' })
  editedAt!: Date
}
