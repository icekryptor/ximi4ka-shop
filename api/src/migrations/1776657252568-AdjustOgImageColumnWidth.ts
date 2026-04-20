import type { MigrationInterface, QueryRunner } from "typeorm";

export class AdjustOgImageColumnWidth1776657252568 implements MigrationInterface {
    name = 'AdjustOgImageColumnWidth1776657252568'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "og_image" TYPE character varying(500)`);
        await queryRunner.query(`ALTER TABLE "pages" ALTER COLUMN "og_image" TYPE character varying(500)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "pages" ALTER COLUMN "og_image" TYPE character varying(255)`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "og_image" TYPE character varying(255)`);
    }

}
