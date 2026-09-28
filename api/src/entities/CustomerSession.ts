import 'reflect-metadata'
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  type Relation,
} from 'typeorm'
import { Customer } from './Customer.js'

// Как admin_sessions: в базе только sha256 токена из cookie.
@Entity({ name: 'customer_sessions' })
export class CustomerSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 64, name: 'token_hash' })
  tokenHash!: string

  @Column({ type: 'uuid', name: 'customer_id' })
  customerId!: string

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer!: Relation<Customer>

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null

  @Column({ type: 'varchar', length: 45, name: 'created_ip', nullable: true })
  createdIp!: string | null

  @Column({ type: 'varchar', length: 500, name: 'user_agent', nullable: true })
  userAgent!: string | null
}
