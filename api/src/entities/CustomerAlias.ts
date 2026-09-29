import 'reflect-metadata'
import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm'

// След слияния аккаунтов (mergeCustomers): id удалённого покупателя → id
// оставшегося. Внешние клиенты ximi4ka ID (learn) хранят у себя id
// покупателя; без этого следа после слияния они потеряли бы связь и завели
// бы человеку второй аккаунт на платформе.
@Entity({ name: 'customer_aliases' })
export class CustomerAlias {
  @PrimaryColumn('uuid', { name: 'former_id' })
  formerId!: string

  @Column({ type: 'uuid', name: 'customer_id' })
  customerId!: string

  @CreateDateColumn({ type: 'timestamptz', name: 'merged_at' })
  mergedAt!: Date
}
