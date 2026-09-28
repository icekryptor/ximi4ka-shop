import 'reflect-metadata'
import { Entity, PrimaryColumn, Column } from 'typeorm'

// Код входа по почте. id задаёт код приложения (randomUUID) — он входит в
// хэш кода. created_at тоже пишет приложение: по нему считаются лимиты
// отправки, и тесты подставляют своё «сейчас».
@Entity({ name: 'customer_email_codes' })
export class CustomerEmailCode {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 255 })
  email!: string

  @Column({ type: 'varchar', length: 64, name: 'code_hash' })
  codeHash!: string

  @Column({ type: 'integer', default: 0 })
  attempts!: number

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date

  @Column({ type: 'timestamptz', name: 'consumed_at', nullable: true })
  consumedAt!: Date | null

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date
}
