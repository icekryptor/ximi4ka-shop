import type { MigrationInterface, QueryRunner } from 'typeorm'

// Секрет заказа для страницы «спасибо»: номера XM-YYYY-NNNNN идут подряд,
// по одному номеру трек СДЭК отдавать нельзя. Токен — 32 hex-символа из
// gen_random_uuid() (криптостойкий генератор Postgres ≥ 13); DEFAULT с
// volatile-функцией заполняет существующие заказы разными значениями.
export class AddOrderPublicToken1790660000000 implements MigrationInterface {
  name = 'AddOrderPublicToken1790660000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "public_token" varchar(64) NOT NULL
       DEFAULT replace(gen_random_uuid()::text, '-', '')`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_orders_public_token" ON "orders" ("public_token")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_orders_public_token"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "public_token"`)
  }
}
