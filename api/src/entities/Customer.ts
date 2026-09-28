import 'reflect-metadata'
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

// bigint pg отдаёт строкой; id пользователей Telegram укладываются в
// Number.MAX_SAFE_INTEGER — приводим к числу, как telegramMessageId в Order.
export const bigintNumber = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value == null ? null : Number(value)),
}

// Покупатель витрины (спека 2026-09-28-customer-account-design.md §3).
// email пишется только после подтверждения кодом и хранится в нижнем
// регистре. Хотя бы один способ входа есть всегда (CHECK в миграции).
@Entity({ name: 'customers' })
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null

  @Column({ type: 'bigint', name: 'telegram_id', nullable: true, transformer: bigintNumber })
  telegramId!: number | null

  @Column({ type: 'varchar', length: 32, name: 'telegram_username', nullable: true })
  telegramUsername!: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  phone!: string | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date

  @Column({ type: 'timestamptz', name: 'last_login_at', nullable: true })
  lastLoginAt!: Date | null
}
