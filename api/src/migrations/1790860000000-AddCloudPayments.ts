import type { MigrationInterface, QueryRunner } from 'typeorm'

// CloudPayments (docs/superpowers/plans/2026-10-27-cloudpayments-integration.md):
// payment_surcharge_rub — надбавка за оплату через CloudPayments, входит в total_rub;
// у старых заказов и остальных способов 0. В настройках — рубильник, режим и процент
// надбавки; ключи живут только в env.
// IF NOT EXISTS: колонки можно добавить на проде заранее, повторный запуск не упадёт.
export class AddCloudPayments1790860000000 implements MigrationInterface {
  name = 'AddCloudPayments1790860000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_surcharge_rub" integer NOT NULL DEFAULT 0`,
    )
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "cloudpayments_enabled" boolean NOT NULL DEFAULT false`,
    )
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "cloudpayments_mode" varchar(16) NOT NULL DEFAULT 'test'`,
    )
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "cloudpayments_surcharge_percent" integer NOT NULL DEFAULT 0`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "cloudpayments_surcharge_percent"`,
    )
    await queryRunner.query(
      `ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "cloudpayments_mode"`,
    )
    await queryRunner.query(
      `ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "cloudpayments_enabled"`,
    )
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "payment_surcharge_rub"`)
  }
}
