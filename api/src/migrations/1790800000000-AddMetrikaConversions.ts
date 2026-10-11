import type { MigrationInterface, QueryRunner } from 'typeorm'

// Очередь офлайн-конверсий в Метрику: одна запись на заказ (уникальный индекс
// по order_id защищает от повторной отправки одной оплаты).
export class AddMetrikaConversions1790800000000 implements MigrationInterface {
  name = 'AddMetrikaConversions1790800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "metrika_conversions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "yclid" character varying(100) NOT NULL,
        "target" character varying(64) NOT NULL,
        "price_rub" integer NOT NULL,
        "event_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "state" character varying(16) NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "next_attempt_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "claimed_at" TIMESTAMP WITH TIME ZONE,
        "upload_id" bigint,
        "sent_at" TIMESTAMP WITH TIME ZONE,
        "last_error" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_metrika_conversions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_metrika_conversions_order" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_metrika_conversions_order" ON "metrika_conversions" ("order_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_metrika_conversions_due" ON "metrika_conversions" ("next_attempt_at") WHERE "state" = 'pending'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_metrika_conversions_due"`)
    await queryRunner.query(`DROP INDEX "UQ_metrika_conversions_order"`)
    await queryRunner.query(`DROP TABLE "metrika_conversions"`)
  }
}
