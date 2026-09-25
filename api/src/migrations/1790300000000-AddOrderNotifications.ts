import type { MigrationInterface, QueryRunner } from 'typeorm'

// Уведомления о заказах в Google Таблицу и Telegram: поля заказа и очередь
// (docs/superpowers/specs/2026-09-25-order-notifications-design.md). Статус
// «отправлен» миграции не требует — status хранится строкой varchar(32).
export class AddOrderNotifications1790300000000 implements MigrationInterface {
  name = 'AddOrderNotifications1790300000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD "customer_telegram" character varying(33)`)
    await queryRunner.query(`ALTER TABLE "orders" ADD "telegram_message_id" bigint`)
    await queryRunner.query(
      `CREATE TABLE "order_notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "channel" character varying(16) NOT NULL,
        "event_key" character varying(32) NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "next_attempt_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "sent_at" TIMESTAMP WITH TIME ZONE,
        "failed_at" TIMESTAMP WITH TIME ZONE,
        "last_error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_notifications_order" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE CASCADE
      )`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_order_notifications_event" ON "order_notifications" ("order_id", "channel", "event_key")`,
    )
    // Обработчик ищет только недоставленные и несданные записи.
    await queryRunner.query(
      `CREATE INDEX "IDX_order_notifications_due" ON "order_notifications" ("next_attempt_at")
       WHERE "sent_at" IS NULL AND "failed_at" IS NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "order_notifications"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "telegram_message_id"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "customer_telegram"`)
  }
}
