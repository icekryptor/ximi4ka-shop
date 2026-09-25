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
import type { NotificationChannel, OrderEventKey } from '@ximi4ka-shop/shared'
import { Order } from './Order.js'

// Запись очереди «событие заказа × канал». Ставится в одной транзакции с
// изменением заказа (lib/notifications/outbox.ts), доставляется
// обработчиком (lib/notifications/worker.ts).
@Entity({ name: 'order_notifications' })
@Index('UQ_order_notifications_event', ['orderId', 'channel', 'eventKey'], { unique: true })
export class OrderNotification {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'order_id' })
  orderId!: string

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Relation<Order>

  @Column({ type: 'varchar', length: 16 })
  channel!: NotificationChannel

  @Column({ type: 'varchar', length: 32, name: 'event_key' })
  eventKey!: OrderEventKey

  @Column({ type: 'integer', default: 0 })
  attempts!: number

  @Column({ type: 'timestamptz', name: 'next_attempt_at', default: () => 'now()' })
  nextAttemptAt!: Date

  @Column({ type: 'timestamptz', name: 'sent_at', nullable: true })
  sentAt!: Date | null

  @Column({ type: 'timestamptz', name: 'failed_at', nullable: true })
  failedAt!: Date | null

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError!: string | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date
}
