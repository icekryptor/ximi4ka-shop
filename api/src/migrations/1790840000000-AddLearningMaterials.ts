import type { MigrationInterface, QueryRunner } from 'typeorm'

// Электронные материалы: каталог, связь «товар → материал» и выдачи покупателям.
// Выдача за заказ уникальна по (order_id, material_id), поэтому повторная
// оплата/сверка ничего не дублирует.
export class AddLearningMaterials1790840000000 implements MigrationInterface {
  name = 'AddLearningMaterials1790840000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "learning_materials" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying(255) NOT NULL,
        "kind" character varying(16) NOT NULL,
        "file_key" character varying(255),
        "file_name" character varying(255),
        "mime_type" character varying(127),
        "size_bytes" integer,
        "external_url" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_learning_materials" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_learning_materials_kind" CHECK ("kind" IN ('file', 'link')),
        CONSTRAINT "CHK_learning_materials_payload" CHECK (
          ("kind" = 'file' AND "file_key" IS NOT NULL)
          OR ("kind" = 'link' AND "external_url" IS NOT NULL)
        )
      )`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_learning_materials_file_key"
       ON "learning_materials" ("file_key") WHERE "file_key" IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE TABLE "learning_material_products" (
        "material_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        CONSTRAINT "PK_learning_material_products" PRIMARY KEY ("material_id", "product_id"),
        CONSTRAINT "FK_lmp_material" FOREIGN KEY ("material_id")
          REFERENCES "learning_materials"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_lmp_product" FOREIGN KEY ("product_id")
          REFERENCES "products"("id") ON DELETE CASCADE
      )`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_lmp_product" ON "learning_material_products" ("product_id")`,
    )
    await queryRunner.query(
      `CREATE TABLE "material_grants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "material_id" uuid NOT NULL,
        "order_id" uuid,
        "customer_id" uuid,
        "email" character varying(255),
        "source" character varying(16) NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_material_grants" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_material_grants_source" CHECK ("source" IN ('order', 'admin', 'link')),
        CONSTRAINT "FK_material_grants_material" FOREIGN KEY ("material_id")
          REFERENCES "learning_materials"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_material_grants_order" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_material_grants_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id") ON DELETE SET NULL
      )`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_material_grants_order_material"
       ON "material_grants" ("order_id", "material_id") WHERE "order_id" IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_material_grants_customer" ON "material_grants" ("customer_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_material_grants_email" ON "material_grants" ("email")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "material_grants"`)
    await queryRunner.query(`DROP TABLE "learning_material_products"`)
    await queryRunner.query(`DROP TABLE "learning_materials"`)
  }
}
