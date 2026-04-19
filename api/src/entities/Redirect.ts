import 'reflect-metadata'
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm'

@Entity({ name: 'redirects' })
@Index(['fromPath'], { unique: true })
export class Redirect {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 1000, name: 'from_path' })
  fromPath!: string

  @Column({ type: 'varchar', length: 1000, name: 'to_path' })
  toPath!: string

  @Column({ type: 'integer', name: 'status_code', default: 301 })
  statusCode!: number

  @Column({ type: 'integer', name: 'hit_count', default: 0 })
  hitCount!: number
}
