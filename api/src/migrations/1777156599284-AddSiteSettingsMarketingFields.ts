import type { MigrationInterface, QueryRunner } from 'typeorm'

// Stage 2 / homepage redesign. Three new site_settings columns drive the
// marketing surface area:
//   header_promo_text   — optional banner string for the top of the header.
//                         null hides the strip entirely.
//   trust_strip_items   — jsonb array of { icon, label } used in the small
//                         trust row under the header (free-shipping, etc).
//   testimonials        — jsonb array of { quote, author, location, rating? }
//                         rendered on the homepage.
//
// jsonb defaults to an empty array so existing rows (and the singleton
// 'default' row seeded by AddSiteSettings) immediately satisfy the NOT NULL
// constraint without a follow-up backfill.
export class AddSiteSettingsMarketingFields1777156599284
  implements MigrationInterface
{
  name = 'AddSiteSettingsMarketingFields1777156599284'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD "header_promo_text" text`,
    )
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD "trust_strip_items" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    )
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD "testimonials" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "site_settings" DROP COLUMN "testimonials"`,
    )
    await queryRunner.query(
      `ALTER TABLE "site_settings" DROP COLUMN "trust_strip_items"`,
    )
    await queryRunner.query(
      `ALTER TABLE "site_settings" DROP COLUMN "header_promo_text"`,
    )
  }
}
