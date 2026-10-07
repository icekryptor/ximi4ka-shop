import type { MigrationInterface, QueryRunner } from 'typeorm'

// Сумма строки заказа с оптовой скидкой. Цена партии (5 пробирок за 99 ₽) не
// делится на целые рубли за штуку, поэтому unit_price_rub остаётся округлённой
// ценой для читателей, а точная сумма живёт здесь. У старых заказов NULL —
// читатели берут unit_price_rub × quantity.
export class AddOrderItemLineTotal1790750000000 implements MigrationInterface {
  name = 'AddOrderItemLineTotal1790750000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_items" ADD COLUMN "line_total_rub" integer`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "line_total_rub"`)
  }
}
