import 'reflect-metadata'
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm'

@Entity({ name: 'admin_users' })
@Index(['email'], { unique: true })
export class AdminUser {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 255 })
  email!: string

  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  passwordHash!: string

  @Column({ type: 'varchar', length: 32, default: 'editor' })
  role!: 'editor' | 'admin'

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date
}
