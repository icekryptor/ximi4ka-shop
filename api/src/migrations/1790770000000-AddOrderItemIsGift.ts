import type { MigrationInterface, QueryRunner } from 'typeorm'

// Подарок к заказу — отдельная строка за 0 ₽. Флаг нужен, чтобы чек Т-Кассы
// её пропускал, а бот, админка и кабинет подписывали «подарок».
export class AddOrderItemIsGift1790770000000 implements MigrationInterface {
  name = 'AddOrderItemIsGift1790770000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD COLUMN "is_gift" boolean NOT NULL DEFAULT false`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "is_gift"`)
  }
}
