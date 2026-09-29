import 'reflect-metadata'
import { Entity, PrimaryColumn, Column } from 'typeorm'

// Одноразовый код ximi4ka ID (спека 2026-09-29-ximi4ka-id-sso-design.md §3).
// Уходит клиенту (learn) в адресе возврата; клиент меняет его на данные
// покупателя запросом сервер-сервер. В базе только sha256 кода.
@Entity({ name: 'sso_auth_codes' })
export class SsoAuthCode {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 64, name: 'code_hash' })
  codeHash!: string

  @Column({ type: 'varchar', length: 32, name: 'client_id' })
  clientId!: string

  @Column({ type: 'varchar', length: 500, name: 'redirect_uri' })
  redirectUri!: string

  @Column({ type: 'uuid', name: 'customer_id' })
  customerId!: string

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date

  @Column({ type: 'timestamptz', name: 'consumed_at', nullable: true })
  consumedAt!: Date | null

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date
}
