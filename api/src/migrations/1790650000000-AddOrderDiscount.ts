import type { MigrationInterface, QueryRunner } from 'typeorm'

// Оптовая скидка на наборы (src/lib/pricing/wholesale.ts). subtotal_rub
// остаётся суммой по обычным ценам, discount_rub — сколько с неё снято;
// total_rub = subtotal_rub − discount_rub + shipping_rub. У старых заказов 0.
export class AddOrderDiscount1790650000000 implements MigrationInterface {
  name = 'AddOrderDiscount1790650000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "discount_rub" integer NOT NULL DEFAULT 0`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "discount_rub"`)
  }
}
