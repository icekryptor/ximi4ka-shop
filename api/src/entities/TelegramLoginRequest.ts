import 'reflect-metadata'
import { Entity, PrimaryColumn, Column } from 'typeorm'
import { bigintNumber } from './Customer.js'

export type TelegramLoginStatus = 'pending' | 'confirmed' | 'consumed'

// Вход (или привязка) через бота: nonce уходит в t.me/<бот>?start=, секрет
// опроса живёт в HttpOnly-cookie начавшего браузера. telegramId пишется на
// «/start» и проверяется на «Подтвердить».
@Entity({ name: 'telegram_login_requests' })
export class TelegramLoginRequest {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 64, name: 'nonce_hash' })
  nonceHash!: string

  @Column({ type: 'varchar', length: 64, name: 'poll_secret_hash' })
  pollSecretHash!: string

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: TelegramLoginStatus

  @Column({ type: 'bigint', name: 'telegram_id', nullable: true, transformer: bigintNumber })
  telegramId!: number | null

  @Column({ type: 'varchar', length: 32, name: 'telegram_username', nullable: true })
  telegramUsername!: string | null

  @Column({ type: 'varchar', length: 255, name: 'telegram_first_name', nullable: true })
  telegramFirstName!: string | null

  @Column({ type: 'uuid', name: 'link_customer_id', nullable: true })
  linkCustomerId!: string | null

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date
}
