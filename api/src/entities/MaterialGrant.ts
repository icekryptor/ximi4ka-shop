import 'reflect-metadata'
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

export type MaterialGrantSource = 'order' | 'admin' | 'link'

// Выдача материала. Ключ доступа — customer_id; email нужен, чтобы выдача
// гостю привязалась к аккаунту при входе (claimOrdersByEmail).
@Entity({ name: 'material_grants' })
export class MaterialGrant {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'material_id' })
  materialId!: string

  @Column({ type: 'uuid', name: 'order_id', nullable: true })
  orderId!: string | null

  @Column({ type: 'uuid', name: 'customer_id', nullable: true })
  customerId!: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null

  @Column({ type: 'varchar', length: 16 })
  source!: MaterialGrantSource

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date
}
