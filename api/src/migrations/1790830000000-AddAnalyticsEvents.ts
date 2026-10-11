import type { MigrationInterface, QueryRunner } from 'typeorm'

// Собственная аналитика витрины: клики и корзины для дашборда админки.
// Без IP и User-Agent — visitor_id случайный и живёт в localStorage браузера.
// Индексы на orders нужны агрегатам статистики по периоду: раньше по
// created_at и paid_at индексов не было.
export class AddAnalyticsEvents1790830000000 implements MigrationInterface {
  name = 'AddAnalyticsEvents1790830000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "analytics_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "type" character varying(32) NOT NULL,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "visitor_id" uuid NOT NULL,
        "path" character varying(300) NOT NULL,
        "meta" jsonb,
        CONSTRAINT "PK_analytics_events" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_events_occurred_type" ON "analytics_events" ("occurred_at", "type")`,
    )
    await queryRunner.query(`CREATE INDEX "IDX_orders_created_at" ON "orders" ("created_at")`)
    await queryRunner.query(`CREATE INDEX "IDX_orders_paid_at" ON "orders" ("paid_at")`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_orders_paid_at"`)
    await queryRunner.query(`DROP INDEX "IDX_orders_created_at"`)
    await queryRunner.query(`DROP INDEX "IDX_analytics_events_occurred_type"`)
    await queryRunner.query(`DROP TABLE "analytics_events"`)
  }
}
