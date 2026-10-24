import type { MigrationInterface, QueryRunner } from 'typeorm'

// Промокод в заказе (shared/types/promo): promo_code — код, promo_discount_rub —
// сколько он снял с суммы товаров; total_rub = subtotal_rub − discount_rub −
// promo_discount_rub + shipping_rub. У старых заказов NULL и 0.
// IF NOT EXISTS: колонки можно добавить на проде заранее, до выкатки кода
// (deploy/README.md), и повторный запуск миграции не упадёт.
export class AddOrderPromoCode1790850000000 implements MigrationInterface {
  name = 'AddOrderPromoCode1790850000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "promo_code" varchar(64)`,
    )
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "promo_discount_rub" integer NOT NULL DEFAULT 0`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "promo_discount_rub"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "promo_code"`)
  }
}
