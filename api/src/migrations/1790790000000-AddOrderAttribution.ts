import type { MigrationInterface, QueryRunner } from 'typeorm'

// Откуда пришёл покупатель: метки из URL и referrer (jsonb: первое и последнее
// касание), плюс адрес и браузер при оформлении. Старые заказы остаются с NULL.
export class AddOrderAttribution1790790000000 implements MigrationInterface {
  name = 'AddOrderAttribution1790790000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "attribution" jsonb`)
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "client_ip" character varying(45)`,
    )
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "client_user_agent" character varying(500)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "client_user_agent"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "client_ip"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "attribution"`)
  }
}
