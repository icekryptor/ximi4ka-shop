import type { MigrationInterface, QueryRunner } from 'typeorm'

// Заявки со страницы /get_materials: имя, телефон, ник Telegram и «как узнали»;
// sheet_synced_at — отметка, что строка дописана в Google-таблицу.
export class AddMaterialLeads1790780000000 implements MigrationInterface {
  name = 'AddMaterialLeads1790780000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "material_leads" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "phone" character varying(64) NOT NULL,
        "telegram" character varying(33),
        "source" character varying(64) NOT NULL,
        "sheet_synced_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_material_leads" PRIMARY KEY ("id")
      )`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "material_leads"`)
  }
}
