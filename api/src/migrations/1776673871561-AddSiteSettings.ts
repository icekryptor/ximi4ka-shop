import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddSiteSettings1776673871561 implements MigrationInterface {
    name = 'AddSiteSettings1776673871561'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "site_settings" ("id" character varying(64) NOT NULL, "metrika_id" character varying(64), "ga4_id" character varying(64), "robots_txt" text NOT NULL DEFAULT 'User-agent: *
Allow: /', "llms_txt" text NOT NULL DEFAULT '', "yandex_webmaster_verification" character varying(64), "google_site_verification" character varying(64), "yml_shop_name" character varying(255), "yml_company" character varying(255), "yml_url" character varying(500), "yandex_pay_enabled" boolean NOT NULL DEFAULT false, "yandex_pay_mode" character varying(16) NOT NULL DEFAULT 'sandbox', "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e4290e8371a166d7e066d131f6e" PRIMARY KEY ("id"))`);
        // Seed the singleton row so GET /api/admin/settings has something to
        // return on a fresh database without relying on a separate seed step.
        await queryRunner.query(`INSERT INTO "site_settings" ("id") VALUES ('default') ON CONFLICT DO NOTHING`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "site_settings"`);
    }

}
