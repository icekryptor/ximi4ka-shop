import type { MigrationInterface, QueryRunner } from 'typeorm'

// Автор статьи блога (сигналы экспертности, SEO-план Q4 2026): только
// добавление пяти необязательных колонок. Существующие строки остаются с
// NULL — у них блока автора нет, в разметке автор по-прежнему «Химичка».
//
// IF NOT EXISTS / IF EXISTS — не украшение: на проде таблицы могут принадлежать
// supabase_admin, и тогда ALTER от ximishop_user падает «must be owner». Чтобы
// не получить новый код на старой схеме, ALTER можно выполнить заранее от
// владельца (см. PR / deploy/README.md), а накат миграции при деплое тогда
// станет безопасным no-op, который лишь отметит её в таблице migrations.
export class AddBlogPostAuthor1790730000000 implements MigrationInterface {
  name = 'AddBlogPostAuthor1790730000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "author_name" character varying(255), ADD COLUMN IF NOT EXISTS "author_job_title" character varying(255), ADD COLUMN IF NOT EXISTS "author_bio" text, ADD COLUMN IF NOT EXISTS "author_url" character varying(500), ADD COLUMN IF NOT EXISTS "author_photo_url" character varying(500)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "blog_posts" DROP COLUMN IF EXISTS "author_photo_url", DROP COLUMN IF EXISTS "author_url", DROP COLUMN IF EXISTS "author_bio", DROP COLUMN IF EXISTS "author_job_title", DROP COLUMN IF EXISTS "author_name"`,
    )
  }
}
