import type { MigrationInterface, QueryRunner } from 'typeorm'

// ximi4ka ID — единый вход для магазина и XimiLearn
// (docs/superpowers/specs/2026-09-29-ximi4ka-id-sso-design.md §3).
export class AddSsoAuthCodes1790720000000 implements MigrationInterface {
  name = 'AddSsoAuthCodes1790720000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sso_auth_codes" (
        "id" uuid PRIMARY KEY,
        "code_hash" varchar(64) NOT NULL,
        "client_id" varchar(32) NOT NULL,
        "redirect_uri" varchar(500) NOT NULL,
        "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL
      )`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_sso_auth_codes_code_hash" ON "sso_auth_codes" ("code_hash")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_sso_auth_codes_customer_id" ON "sso_auth_codes" ("customer_id")`,
    )

    await queryRunner.query(`
      CREATE TABLE "customer_aliases" (
        "former_id" uuid PRIMARY KEY,
        "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
        "merged_at" timestamptz NOT NULL DEFAULT now()
      )`)
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_aliases_customer_id" ON "customer_aliases" ("customer_id")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "customer_aliases"`)
    await queryRunner.query(`DROP TABLE "sso_auth_codes"`)
  }
}
