import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrderPaymentFields1783110000000 implements MigrationInterface {
    name = 'AddOrderPaymentFields1783110000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" ADD "payment_url" character varying(1024)`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "idempotency_key" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "status_history" jsonb NOT NULL DEFAULT '[]'::jsonb`);
        // Unique among non-null values only — Postgres unique indexes ignore NULLs.
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_orders_idempotency_key" ON "orders" ("idempotency_key")`);
        // Atomic per-database counter behind order numbers XM-YYYY-NNNNN.
        // nextval() is concurrency-safe without table locks.
        await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "order_number_seq" START 1`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP SEQUENCE IF EXISTS "order_number_seq"`);
        await queryRunner.query(`DROP INDEX "IDX_orders_idempotency_key"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "status_history"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "idempotency_key"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "payment_url"`);
    }
}
