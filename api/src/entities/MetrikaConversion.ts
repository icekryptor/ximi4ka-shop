import 'reflect-metadata'
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm'
import { Order } from './Order.js'

export type MetrikaConversionState = 'pending' | 'sending' | 'sent' | 'failed'

// Очередь офлайн-конверсий в Яндекс.Метрику: одна запись на заказ. Ставится в
// транзакции оплаты (lib/metrika/queue.ts), уходит пакетом в CSV обработчиком
// (lib/metrika/worker.ts): pending → sending → sent | failed. Документация
// Метрики о дедупликации повторной загрузки молчит, поэтому дубль хуже потери:
// запись захватывается (sending) до отправки, и при неясном исходе (таймаут,
// обрыв, перезапуск) она не уходит второй раз, а сдаётся с пояснением.
@Entity({ name: 'metrika_conversions' })
@Index('UQ_metrika_conversions_order', ['orderId'], { unique: true })
export class MetrikaConversion {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'order_id' })
  orderId!: string

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Relation<Order>

  @Column({ type: 'varchar', length: 100 })
  yclid!: string

  // Идентификатор цели в Метрике (цель «JavaScript-событие», создаётся заранее).
  @Column({ type: 'varchar', length: 64 })
  target!: string

  @Column({ type: 'integer', name: 'price_rub' })
  priceRub!: number

  // Когда заказ оплачен: время конверсии в файле.
  @Column({ type: 'timestamptz', name: 'event_at' })
  eventAt!: Date

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  state!: MetrikaConversionState

  @Column({ type: 'integer', default: 0 })
  attempts!: number

  @Column({ type: 'timestamptz', name: 'next_attempt_at', default: () => 'now()' })
  nextAttemptAt!: Date

  // Когда обработчик захватил запись для отправки (state = sending).
  @Column({ type: 'timestamptz', name: 'claimed_at', nullable: true })
  claimedAt!: Date | null

  // id загрузки в Метрике (bigint: драйвер отдаёт строкой). По нему смотрят
  // статус в отчёте «Офлайн-конверсии».
  @Column({ type: 'bigint', name: 'upload_id', nullable: true })
  uploadId!: string | null

  @Column({ type: 'timestamptz', name: 'sent_at', nullable: true })
  sentAt!: Date | null

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError!: string | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date
}
