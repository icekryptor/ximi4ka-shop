import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddAdminSessions1776655693584 implements MigrationInterface {
    name = 'AddAdminSessions1776655693584'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "admin_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "token_hash" character varying(64) NOT NULL, "admin_user_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_ip" character varying(45), "user_agent" character varying(500), CONSTRAINT "PK_38bb553c2372215d48de2306c5e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_820cb9c73b9f2bf3f2fb678d93" ON "admin_sessions" ("token_hash") `);
        await queryRunner.query(`ALTER TABLE "product_categories" ALTER COLUMN "translations" SET DEFAULT '{}'::jsonb`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "long_description_blocks" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "translations" SET DEFAULT '{}'::jsonb`);
        await queryRunner.query(`ALTER TABLE "pages" ALTER COLUMN "blocks" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`ALTER TABLE "pages" ALTER COLUMN "translations" SET DEFAULT '{}'::jsonb`);
        await queryRunner.query(`ALTER TABLE "admin_sessions" ADD CONSTRAINT "FK_c1711b1831bdf66b77c3605bcdb" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "admin_sessions" DROP CONSTRAINT "FK_c1711b1831bdf66b77c3605bcdb"`);
        await queryRunner.query(`ALTER TABLE "pages" ALTER COLUMN "translations" SET DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "pages" ALTER COLUMN "blocks" SET DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "translations" SET DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "long_description_blocks" SET DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "product_categories" ALTER COLUMN "translations" SET DEFAULT '{}'`);
        await queryRunner.query(`DROP INDEX "public"."IDX_820cb9c73b9f2bf3f2fb678d93"`);
        await queryRunner.query(`DROP TABLE "admin_sessions"`);
    }

}
