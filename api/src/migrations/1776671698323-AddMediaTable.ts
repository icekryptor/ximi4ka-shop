import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddMediaTable1776671698323 implements MigrationInterface {
    name = 'AddMediaTable1776671698323'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "media" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "url" character varying(500) NOT NULL, "filename" character varying(255) NOT NULL, "mime_type" character varying(128) NOT NULL, "size" integer NOT NULL, "width" integer, "height" integer, "uploaded_by" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f4e0fcac36e050de337b670d8bd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c30f45ea7b47895ca14398e974" ON "media" ("created_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_c30f45ea7b47895ca14398e974"`);
        await queryRunner.query(`DROP TABLE "media"`);
    }

}
