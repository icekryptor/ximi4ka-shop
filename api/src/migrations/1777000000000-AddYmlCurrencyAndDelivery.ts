import type { MigrationInterface, QueryRunner } from 'typeorm'

// Phase 7 / YML feed. Two new site_settings columns:
//   yml_currency      — 'RUB' (default) or 'RUR' for legacy exports.
//   yml_delivery_note — optional free-form text for the YML <shop> block.
//
// Both sit alongside the existing yml_* columns so a single UPDATE from the
// admin form keeps the row consistent.
export class AddYmlCurrencyAndDelivery1777000000000
  implements MigrationInterface
{
  name = 'AddYmlCurrencyAndDelivery1777000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD "yml_currency" character varying(8) NOT NULL DEFAULT 'RUB'`,
    )
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD "yml_delivery_note" text`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "site_settings" DROP COLUMN "yml_delivery_note"`,
    )
    await queryRunner.query(
      `ALTER TABLE "site_settings" DROP COLUMN "yml_currency"`,
    )
  }
}
