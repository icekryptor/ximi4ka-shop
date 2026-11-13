import type { MigrationInterface, QueryRunner } from 'typeorm'

// Химикоины, этап 1 (docs/superpowers/plans/2026-11-13-chemcoins-stage1-balance-accrual.md):
// coin_transactions — история операций по балансу (источник истины), customers.coin_balance —
// её кэш (CHECK не даёт уйти в минус), в заказе — обещанный кэшбек и его недобор, момент
// доставки и причина проблемы с доставкой, в отправке СДЭК — состояние опроса трека.
// IF NOT EXISTS: колонки и таблицу можно создать на проде заранее, повторный запуск не упадёт.
export class AddCoins1790870000000 implements MigrationInterface {
  name = 'AddCoins1790870000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "coin_balance" integer NOT NULL DEFAULT 0 CHECK ("coin_balance" >= 0)`,
    )
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "coin_transactions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "customer_id" uuid NOT NULL,
        "amount" integer NOT NULL,
        "kind" varchar(32) NOT NULL,
        "order_id" uuid,
        "comment" text,
        "admin_user_id" uuid,
        "idempotency_key" varchar(128) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coin_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_coin_transactions_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "CHK_coin_transactions_amount" CHECK ("amount" <> 0),
        CONSTRAINT "FK_coin_transactions_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id"),
        CONSTRAINT "FK_coin_transactions_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id")
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_coin_transactions_customer_created" ON "coin_transactions" ("customer_id", "created_at" DESC)`,
    )
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cashback_promised_coins" integer NOT NULL DEFAULT 0`,
    )
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cashback_shortfall_coins" integer NOT NULL DEFAULT 0`,
    )
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivered_at" timestamptz`,
    )
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_problem" varchar(64)`,
    )
    await queryRunner.query(
      `ALTER TABLE "cdek_shipments" ADD COLUMN IF NOT EXISTS "tracking_state" varchar(16) NOT NULL DEFAULT 'none'`,
    )
    await queryRunner.query(
      `ALTER TABLE "cdek_shipments" ADD COLUMN IF NOT EXISTS "next_track_at" timestamptz`,
    )
    await queryRunner.query(
      `ALTER TABLE "cdek_shipments" ADD COLUMN IF NOT EXISTS "last_cdek_status" varchar(64)`,
    )
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "coins_enabled" boolean NOT NULL DEFAULT false`,
    )
    await queryRunner.query(
      `ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "coins_cashback_percent" integer NOT NULL DEFAULT 10`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "coins_cashback_percent"`,
    )
    await queryRunner.query(`ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "coins_enabled"`)
    await queryRunner.query(`ALTER TABLE "cdek_shipments" DROP COLUMN IF EXISTS "last_cdek_status"`)
    await queryRunner.query(`ALTER TABLE "cdek_shipments" DROP COLUMN IF EXISTS "next_track_at"`)
    await queryRunner.query(`ALTER TABLE "cdek_shipments" DROP COLUMN IF EXISTS "tracking_state"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "delivery_problem"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "delivered_at"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "cashback_shortfall_coins"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "cashback_promised_coins"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "coin_transactions"`)
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN IF EXISTS "coin_balance"`)
  }
}
