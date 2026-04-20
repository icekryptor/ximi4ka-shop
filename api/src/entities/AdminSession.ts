import 'reflect-metadata'
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm'
import { AdminUser } from './AdminUser.js'

@Entity({ name: 'admin_sessions' })
export class AdminSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 64, name: 'token_hash' })
  @Index({ unique: true })
  tokenHash!: string

  @Column({ type: 'uuid', name: 'admin_user_id' })
  adminUserId!: string

  @ManyToOne(() => AdminUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'admin_user_id' })
  adminUser!: AdminUser

  @CreateDateColumn({ name: 'created_at' })
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
