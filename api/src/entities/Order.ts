import 'reflect-metadata'
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  OneToMany,
  Index,
} from 'typeorm'
import { OrderItem } from './OrderItem.js'
import type {
  OrderStatus,
  OrderStatusHistoryEntry,
  PaymentProvider,
  DeliveryAddress,
} from '@ximi4ka-shop/shared'

@Entity({ name: 'orders' })
@Index(['orderNumber'], { unique: true })
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 64, name: 'order_number' })
  orderNumber!: string

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: OrderStatus

  @Column({ type: 'varchar', length: 255, name: 'customer_name' })
  customerName!: string

  @Column({ type: 'varchar', length: 64, name: 'customer_phone' })
  customerPhone!: string

  @Column({ type: 'varchar', length: 255, name: 'customer_email' })
  customerEmail!: string

  @Column({ type: 'jsonb', name: 'delivery_address' })
  deliveryAddress!: DeliveryAddress

  @Column({ type: 'varchar', length: 64, name: 'delivery_method' })
  deliveryMethod!: string

  @Column({ type: 'integer', name: 'subtotal_rub' })
  subtotalRub!: number

  @Column({ type: 'integer', name: 'shipping_rub', default: 0 })
  shippingRub!: number

  @Column({ type: 'integer', name: 'total_rub' })
  totalRub!: number

  @Column({ type: 'varchar', length: 32, name: 'payment_provider' })
  paymentProvider!: PaymentProvider

  @Column({ type: 'varchar', length: 255, name: 'payment_intent_id', nullable: true })
  paymentIntentId!: string | null

  // Payment page URL returned by the provider (Init → PaymentURL). Stored so
  // idempotent checkout replays can return the same link.
  @Column({ type: 'varchar', length: 1024, name: 'payment_url', nullable: true })
  paymentUrl!: string | null

  // Client-supplied Idempotency-Key header value; unique among non-null rows,
  // lets a retried checkout POST return the already-created order.
  @Column({ type: 'varchar', length: 255, name: 'idempotency_key', nullable: true })
  idempotencyKey!: string | null

  // Status transition timeline: webhook, reconcile job and manual admin
  // changes append entries here. Rendered in the admin order detail page.
  @Column({ type: 'jsonb', name: 'status_history', default: () => "'[]'::jsonb" })
  statusHistory!: OrderStatusHistoryEntry[]

  @OneToMany(() => OrderItem, (item) => item.order)
  items!: OrderItem[]

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date

  @Column({ type: 'timestamptz', name: 'paid_at', nullable: true })
  paidAt!: Date | null

  @Column({ type: 'timestamptz', name: 'erp_synced_at', nullable: true })
  erpSyncedAt!: Date | null

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null
}
