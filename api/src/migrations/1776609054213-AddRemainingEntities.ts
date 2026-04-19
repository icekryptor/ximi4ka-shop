import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddRemainingEntities1776609054213 implements MigrationInterface {
    name = 'AddRemainingEntities1776609054213'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "pages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying(255) NOT NULL, "title" character varying(500) NOT NULL, "blocks" jsonb NOT NULL DEFAULT '[]'::jsonb, "meta_title" character varying(255), "meta_description" text, "og_image" character varying(255), "canonical_url" character varying(500), "noindex" boolean NOT NULL DEFAULT false, "translations" jsonb NOT NULL DEFAULT '{}'::jsonb, "is_published" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_fe66ca6a86dc94233e5d7789535" UNIQUE ("slug"), CONSTRAINT "PK_8f21ed625aa34c8391d636b7d3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "order_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "product_id" uuid NOT NULL, "product_snapshot" jsonb NOT NULL, "quantity" integer NOT NULL, "unit_price_rub" integer NOT NULL, CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_number" character varying(64) NOT NULL, "status" character varying(32) NOT NULL DEFAULT 'pending', "customer_name" character varying(255) NOT NULL, "customer_phone" character varying(64) NOT NULL, "customer_email" character varying(255) NOT NULL, "delivery_address" jsonb NOT NULL, "delivery_method" character varying(64) NOT NULL, "subtotal_rub" integer NOT NULL, "shipping_rub" integer NOT NULL DEFAULT '0', "total_rub" integer NOT NULL, "payment_provider" character varying(32) NOT NULL, "payment_intent_id" character varying(255), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "paid_at" TIMESTAMP WITH TIME ZONE, "erp_synced_at" TIMESTAMP WITH TIME ZONE, "deleted_at" TIMESTAMP, CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_75eba1c6b1a66b09f2a97e6927" ON "orders" ("order_number") `);
        await queryRunner.query(`CREATE TABLE "admin_users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(255) NOT NULL, "password_hash" character varying(255) NOT NULL, "role" character varying(32) NOT NULL DEFAULT 'editor', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_06744d221bb6145dc61e5dc441d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_dcd0c8a4b10af9c986e510b9ec" ON "admin_users" ("email") `);
        await queryRunner.query(`CREATE TABLE "entity_revisions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "entity_type" character varying(64) NOT NULL, "entity_id" uuid NOT NULL, "snapshot" jsonb NOT NULL, "edited_by" uuid, "edited_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c4b1255723ea20066b5381878d6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3dd7aae2aabe9332d69646eb6d" ON "entity_revisions" ("entity_type", "entity_id") `);
        await queryRunner.query(`CREATE TABLE "redirects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "from_path" character varying(1000) NOT NULL, "to_path" character varying(1000) NOT NULL, "status_code" integer NOT NULL DEFAULT '301', "hit_count" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_d81f0797728eb0eb92ae3c6eedd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_294da5325047f1e02da0a0f59c" ON "redirects" ("from_path") `);
        await queryRunner.query(`ALTER TABLE "product_categories" ALTER COLUMN "translations" SET DEFAULT '{}'::jsonb`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "long_description_blocks" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "translations" SET DEFAULT '{}'::jsonb`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_145532db85752b29c57d2b7b1f1"`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "translations" SET DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "long_description_blocks" SET DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "product_categories" ALTER COLUMN "translations" SET DEFAULT '{}'`);
        await queryRunner.query(`DROP INDEX "public"."IDX_294da5325047f1e02da0a0f59c"`);
        await queryRunner.query(`DROP TABLE "redirects"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3dd7aae2aabe9332d69646eb6d"`);
        await queryRunner.query(`DROP TABLE "entity_revisions"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dcd0c8a4b10af9c986e510b9ec"`);
        await queryRunner.query(`DROP TABLE "admin_users"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_75eba1c6b1a66b09f2a97e6927"`);
        await queryRunner.query(`DROP TABLE "orders"`);
        await queryRunner.query(`DROP TABLE "order_items"`);
        await queryRunner.query(`DROP TABLE "pages"`);
    }

}
