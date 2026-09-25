import type { MigrationInterface, QueryRunner } from 'typeorm'

// Данные для доставки СДЭК: вес и то, как товар раскладывается по коробкам
// (см. api/src/lib/shipping/pack.ts). Все поля с безопасными умолчаниями —
// товар без заполненных данных считается мелочью весом по умолчанию.
export class AddProductShippingFields1790165287367 implements MigrationInterface {
  name = 'AddProductShippingFields1790165287367'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" ADD "weight_g" integer`)
    await queryRunner.query(
      `ALTER TABLE "products" ADD "ship_boxes" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    )
    await queryRunner.query(`ALTER TABLE "products" ADD "loose_units" integer NOT NULL DEFAULT 1`)
    await queryRunner.query(`ALTER TABLE "products" ADD "min_box" character varying(16)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "min_box"`)
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "loose_units"`)
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "ship_boxes"`)
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "weight_g"`)
  }
}
