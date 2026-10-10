import type { MigrationInterface, QueryRunner } from 'typeorm'

// Yandex Commerce Protocol (docs/superpowers/specs/2026-10-11-ycp-integration-design.md):
// флаг кнопки «Купить в 1 клик» у товара, источник заказа и идентификаторы
// сессии и заказа на стороне Яндекса, снимок пунктов выдачи СДЭК для
// GET /api/v1/checkout/delivery/pickup_points (переживает перезапуск api).
//
// IF NOT EXISTS — потому что deploy.sh сначала переключает контейнеры и только
// потом гоняет миграции: колонки заранее добавляет владелец тем же SQL
// (docs/ycp/RUNBOOK.md), а миграция при деплое проходит как no-op.
export class AddYcpFields1790790000000 implements MigrationInterface {
  name = 'AddYcpFields1790790000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "ycp_enabled" boolean NOT NULL DEFAULT false`,
    )
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "source" character varying(16) NOT NULL DEFAULT 'site'`,
    )
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "external_session_id" character varying(64)`,
    )
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "external_order_id" character varying(64)`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_orders_external_session_id" ON "orders" ("external_session_id") WHERE "external_session_id" IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_orders_external_order_id" ON "orders" ("external_order_id") WHERE "external_order_id" IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "ycp_pickup_points_snapshot" (
        "id" smallint NOT NULL,
        "entries" jsonb NOT NULL,
        "built_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_ycp_pickup_points_snapshot" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_ycp_pickup_points_snapshot_single" CHECK ("id" = 1)
      )`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ycp_pickup_points_snapshot"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_external_order_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_external_session_id"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "external_order_id"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "external_session_id"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "source"`)
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "ycp_enabled"`)
  }
}
