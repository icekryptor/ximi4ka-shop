import 'reflect-metadata'
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { Order } from './Order.js'

@Entity({ name: 'order_items' })
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'order_id' })
  orderId!: string

  @ManyToOne(() => Order, (o) => o.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order

  @Column({ type: 'uuid', name: 'product_id' })
  productId!: string

  @Column({ type: 'jsonb', name: 'product_snapshot' })
  productSnapshot!: { name: string; sku: string | null; priceRub: number }

  @Column({ type: 'integer' })
  quantity!: number

  @Column({ type: 'integer', name: 'unit_price_rub' })
  unitPriceRub!: number
}
