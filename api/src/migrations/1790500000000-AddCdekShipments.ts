import type { MigrationInterface, QueryRunner } from 'typeorm'

// Очередь создания заказа в СДЭК после оплаты
// (docs/superpowers/specs/2026-09-25-cdek-auto-orders-design.md §4).
export class AddCdekShipments1790500000000 implements MigrationInterface {
  name = 'AddCdekShipments1790500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "cdek_shipments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "state" character varying(16) NOT NULL DEFAULT 'queued',
        "attempts" integer NOT NULL DEFAULT 0,
        "next_attempt_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "cdek_uuid" uuid,
        "cdek_number" character varying(32),
        "last_error" text,
        "submitted_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cdek_shipments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cdek_shipments_order" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE CASCADE
      )`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_cdek_shipments_order" ON "cdek_shipments" ("order_id")`,
    )
    // Обработчик берёт только незавершённые записи.
    await queryRunner.query(
      `CREATE INDEX "IDX_cdek_shipments_due" ON "cdek_shipments" ("next_attempt_at")
       WHERE "state" IN ('queued', 'registering')`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "cdek_shipments"`)
  }
}
