import 'reflect-metadata'
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm'
import type { CdekShipmentState } from '@ximi4ka-shop/shared'
import { Order } from './Order.js'

// Очередь создания заказа в СДЭК: одна запись на заказ. Ставится в одной
// транзакции с оплатой (lib/cdek/queue.ts), проводится обработчиком
// (lib/cdek/worker.ts): queued → registering → created | failed.
@Entity({ name: 'cdek_shipments' })
@Index('UQ_cdek_shipments_order', ['orderId'], { unique: true })
export class CdekShipment {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'order_id' })
  orderId!: string

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Relation<Order>

  @Column({ type: 'varchar', length: 16, default: 'queued' })
  state!: CdekShipmentState

  @Column({ type: 'integer', default: 0 })
  attempts!: number

  @Column({ type: 'timestamptz', name: 'next_attempt_at', default: () => 'now()' })
  nextAttemptAt!: Date

  @Column({ type: 'uuid', name: 'cdek_uuid', nullable: true })
  cdekUuid!: string | null

  @Column({ type: 'varchar', length: 32, name: 'cdek_number', nullable: true })
  cdekNumber!: string | null

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError!: string | null

  // Когда СДЭК принял POST — от него считаем 30 минут ожидания регистрации.
  @Column({ type: 'timestamptz', name: 'submitted_at', nullable: true })
  submittedAt!: Date | null

  // Опрос трека СДЭК после создания заказа (химикоины: кэшбек за доставленное).
  // Тип состояния уточнится вместе с самим опросом.
  @Column({ type: 'varchar', length: 16, name: 'tracking_state', default: 'none' })
  trackingState!: string

  @Column({ type: 'timestamptz', name: 'next_track_at', nullable: true })
  nextTrackAt!: Date | null

  @Column({ type: 'varchar', length: 64, name: 'last_cdek_status', nullable: true })
  lastCdekStatus!: string | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date
}
