import type { MigrationInterface, QueryRunner } from 'typeorm'

// SEO-текст и FAQ на странице категории (SEO-план Q4 2026): только добавление
// одной необязательной колонки jsonb. Существующие категории остаются с NULL —
// у них блока SEO-текста нет, витрина ничего не выводит.
//
// IF NOT EXISTS / IF EXISTS — не украшение: на проде таблицы могут принадлежать
// supabase_admin, и тогда ALTER от ximishop_user падает «must be owner». Каталог —
// ядро магазина: API категорий и товаров читает product_categories, поэтому
// новый код на старой схеме отвечает 500. Чтобы этого не случилось, ALTER
// выполняют заранее от владельца (см. PR / deploy/README.md), а накат миграции
// при деплое тогда становится безопасным no-op, который лишь отметит её в
// таблице migrations.
export class AddProductCategorySeoBlocks1790740000000 implements MigrationInterface {
  name = 'AddProductCategorySeoBlocks1790740000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_categories" ADD COLUMN IF NOT EXISTS "seo_blocks" jsonb`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_categories" DROP COLUMN IF EXISTS "seo_blocks"`)
  }
}
