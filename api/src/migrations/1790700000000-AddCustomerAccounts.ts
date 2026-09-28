import type { MigrationInterface, QueryRunner } from 'typeorm'

// Личный кабинет покупателя (docs/superpowers/specs/2026-09-28-customer-account-design.md §3).
export class AddCustomerAccounts1790700000000 implements MigrationInterface {
  name = 'AddCustomerAccounts1790700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(255) NULL,
        "telegram_id" bigint NULL,
        "telegram_username" varchar(32) NULL,
        "name" varchar(255) NULL,
        "phone" varchar(64) NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "last_login_at" timestamptz NULL,
        CONSTRAINT "CHK_customers_login_method" CHECK ("email" IS NOT NULL OR "telegram_id" IS NOT NULL)
      )`)
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_customers_email" ON "customers" ("email")`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_customers_telegram_id" ON "customers" ("telegram_id")`,
    )

    await queryRunner.query(`
      CREATE TABLE "customer_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "token_hash" varchar(64) NOT NULL,
        "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz NULL,
        "created_ip" varchar(45) NULL,
        "user_agent" varchar(500) NULL
      )`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_customer_sessions_token_hash" ON "customer_sessions" ("token_hash")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_sessions_customer_id" ON "customer_sessions" ("customer_id")`,
    )

    await queryRunner.query(`
      CREATE TABLE "customer_email_codes" (
        "id" uuid PRIMARY KEY,
        "email" varchar(255) NOT NULL,
        "code_hash" varchar(64) NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL
      )`)
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_email_codes_email_created" ON "customer_email_codes" ("email", "created_at")`,
    )

    await queryRunner.query(`
      CREATE TABLE "telegram_login_requests" (
        "id" uuid PRIMARY KEY,
        "nonce_hash" varchar(64) NOT NULL,
        "poll_secret_hash" varchar(64) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'pending',
        "telegram_id" bigint NULL,
        "telegram_username" varchar(32) NULL,
        "telegram_first_name" varchar(255) NULL,
        "link_customer_id" uuid NULL,
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL
      )`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_telegram_login_requests_nonce" ON "telegram_login_requests" ("nonce_hash")`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_telegram_login_requests_poll" ON "telegram_login_requests" ("poll_secret_hash")`,
    )

    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "customer_id" uuid NULL REFERENCES "customers"("id") ON DELETE SET NULL`,
    )
    await queryRunner.query(`CREATE INDEX "IDX_orders_customer_id" ON "orders" ("customer_id")`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_orders_customer_id"`)
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "customer_id"`)
    await queryRunner.query(`DROP TABLE "telegram_login_requests"`)
    await queryRunner.query(`DROP TABLE "customer_email_codes"`)
    await queryRunner.query(`DROP TABLE "customer_sessions"`)
    await queryRunner.query(`DROP TABLE "customers"`)
  }
}
