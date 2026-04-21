import 'reflect-metadata'
import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm'

// Singleton table. The app only ever reads/writes a single row with
// id = 'default'. Modelled as a table (rather than a JSON blob in a
// key/value store) so each field keeps its type, length limits, and
// migration history — much friendlier for schema evolution than JSONB.
@Entity({ name: 'site_settings' })
export class SiteSettings {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string

  // --- Analytics ---
  @Column({ type: 'varchar', length: 64, name: 'metrika_id', nullable: true })
  metrikaId!: string | null

  @Column({ type: 'varchar', length: 64, name: 'ga4_id', nullable: true })
  ga4Id!: string | null

  // --- SEO ---
  @Column({
    type: 'text',
    name: 'robots_txt',
    default: 'User-agent: *\nAllow: /',
  })
  robotsTxt!: string

  @Column({ type: 'text', name: 'llms_txt', default: '' })
  llmsTxt!: string

  @Column({
    type: 'varchar',
    length: 64,
    name: 'yandex_webmaster_verification',
    nullable: true,
  })
  yandexWebmasterVerification!: string | null

  @Column({
    type: 'varchar',
    length: 64,
    name: 'google_site_verification',
    nullable: true,
  })
  googleSiteVerification!: string | null

  // --- YML feed metadata ---
  @Column({
    type: 'varchar',
    length: 255,
    name: 'yml_shop_name',
    nullable: true,
  })
  ymlShopName!: string | null

  @Column({ type: 'varchar', length: 255, name: 'yml_company', nullable: true })
  ymlCompany!: string | null

  @Column({ type: 'varchar', length: 500, name: 'yml_url', nullable: true })
  ymlUrl!: string | null

  // Currency code used in the YML feed. Yandex accepts both 'RUB' (the ISO
  // 4217 code) and the legacy 'RUR'. Default to 'RUB' which matches the
  // current Yandex Market spec.
  @Column({
    type: 'varchar',
    length: 8,
    name: 'yml_currency',
    default: 'RUB',
  })
  ymlCurrency!: 'RUB' | 'RUR'

  // Optional free-form delivery blurb surfaced inside the YML <shop> block
  // under <delivery_options>. Kept nullable because many shops don't want
  // to declare structured delivery options in the feed at all.
  @Column({ type: 'text', name: 'yml_delivery_note', nullable: true })
  ymlDeliveryNote!: string | null

  // --- Payment toggle ---
  // API credentials themselves are NOT stored here — they live in env vars.
  // Only the toggle + mode affect the checkout UI.
  @Column({ type: 'boolean', name: 'yandex_pay_enabled', default: false })
  yandexPayEnabled!: boolean

  @Column({
    type: 'varchar',
    length: 16,
    name: 'yandex_pay_mode',
    default: 'sandbox',
  })
  yandexPayMode!: 'sandbox' | 'production'

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date
}
