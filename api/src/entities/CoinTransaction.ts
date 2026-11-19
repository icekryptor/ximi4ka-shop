import 'reflect-metadata'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { CoinTransactionKind } from '@ximi4ka-shop/shared/types/coins'

// Одна операция по балансу химикоинов: amount со знаком, не 0. Таблица — источник
// истины, customers.coin_balance — её кэш (lib/coins/ledger.ts меняет их вместе).
// idempotency_key уникален: повтор события (вебхук, опрос) не начислит дважды.
@Entity({ name: 'coin_transactions' })
@Index('IDX_coin_transactions_customer_created', ['customerId', 'createdAt'])
export class CoinTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'customer_id' })
  customerId!: string

  @Column({ type: 'integer' })
  amount!: number

  @Column({ type: 'varchar', length: 32 })
  kind!: CoinTransactionKind

  @Column({ type: 'uuid', name: 'order_id', nullable: true })
  orderId!: string | null

  @Column({ type: 'text', nullable: true })
  comment!: string | null

  @Column({ type: 'uuid', name: 'admin_user_id', nullable: true })
  adminUserId!: string | null

  @Column({ type: 'varchar', length: 128, name: 'idempotency_key', unique: true })
  idempotencyKey!: string

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date
}
