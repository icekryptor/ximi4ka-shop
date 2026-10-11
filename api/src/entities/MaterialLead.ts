import 'reflect-metadata'
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

// Заявка на обучающие материалы со страницы /get_materials (QR-коды на наборах).
// Заказов и покупателей не касается: это просто список тех, кто оставил контакты.
@Entity({ name: 'material_leads' })
export class MaterialLead {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 255 })
  name!: string

  @Column({ type: 'varchar', length: 64 })
  phone!: string

  @Column({ type: 'varchar', length: 33, nullable: true })
  telegram!: string | null

  // Ответ на «Как вы о нас узнали?» — одно из MATERIAL_LEAD_SOURCES.
  @Column({ type: 'varchar', length: 64 })
  source!: string

  // Когда заявка ушла в Google-таблицу; null — не ушла (нет доступа, сбой Google).
  @Column({ type: 'timestamptz', name: 'sheet_synced_at', nullable: true })
  sheetSyncedAt!: Date | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date
}
