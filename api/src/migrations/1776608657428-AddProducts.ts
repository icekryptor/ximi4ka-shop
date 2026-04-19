import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddProducts1776608657428 implements MigrationInterface {
    name = 'AddProducts1776608657428'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TABLE "product_images" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "url" character varying(500) NOT NULL, "alt" character varying(255) NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_1974264ea7265989af8392f63a1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "product_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying(255) NOT NULL, "name" character varying(255) NOT NULL, "parent_id" uuid, "meta_title" character varying(255), "meta_description" text, "sort_order" integer NOT NULL DEFAULT '0', "translations" jsonb NOT NULL DEFAULT '{}'::jsonb, CONSTRAINT "UQ_f314a8b42f88d87b2dcb7fc491a" UNIQUE ("slug"), CONSTRAINT "PK_7069dac60d88408eca56fdc9e0c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying(255) NOT NULL, "sku" character varying(64), "name" character varying(500) NOT NULL, "short_description" text, "long_description_blocks" jsonb NOT NULL DEFAULT '[]'::jsonb, "price_rub" integer NOT NULL, "compare_at_price_rub" integer, "stock_status" character varying(32) NOT NULL DEFAULT 'in_stock', "is_published" boolean NOT NULL DEFAULT false, "sort_order" integer NOT NULL DEFAULT '0', "meta_title" character varying(255), "meta_description" text, "og_image" character varying(255), "canonical_url" character varying(500), "noindex" boolean NOT NULL DEFAULT false, "translations" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_464f927ae360106b783ed0b4106" UNIQUE ("slug"), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "product_category_links" ("category_id" uuid NOT NULL, "product_id" uuid NOT NULL, CONSTRAINT "PK_3d552929a0e8dc00e9e99a1577d" PRIMARY KEY ("category_id", "product_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6a244b8fec3db8a3ce4b8c797e" ON "product_category_links" ("category_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_a108ea5e3a037ff68cc5081866" ON "product_category_links" ("product_id") `);
        await queryRunner.query(`ALTER TABLE "product_images" ADD CONSTRAINT "FK_4f166bb8c2bfcef2498d97b4068" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_categories" ADD CONSTRAINT "FK_5f151d414daab0290f65b517ed4" FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_category_links" ADD CONSTRAINT "FK_6a244b8fec3db8a3ce4b8c797e5" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "product_category_links" ADD CONSTRAINT "FK_a108ea5e3a037ff68cc50818665" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_category_links" DROP CONSTRAINT "FK_a108ea5e3a037ff68cc50818665"`);
        await queryRunner.query(`ALTER TABLE "product_category_links" DROP CONSTRAINT "FK_6a244b8fec3db8a3ce4b8c797e5"`);
        await queryRunner.query(`ALTER TABLE "product_categories" DROP CONSTRAINT "FK_5f151d414daab0290f65b517ed4"`);
        await queryRunner.query(`ALTER TABLE "product_images" DROP CONSTRAINT "FK_4f166bb8c2bfcef2498d97b4068"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a108ea5e3a037ff68cc5081866"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6a244b8fec3db8a3ce4b8c797e"`);
        await queryRunner.query(`DROP TABLE "product_category_links"`);
        await queryRunner.query(`DROP TABLE "products"`);
        await queryRunner.query(`DROP TABLE "product_categories"`);
        await queryRunner.query(`DROP TABLE "product_images"`);
    }

}
