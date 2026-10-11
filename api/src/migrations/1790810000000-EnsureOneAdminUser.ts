import type { MigrationInterface, QueryRunner } from 'typeorm'

// Вместе с проверкой ролей в админке (заказы и настройки — только admin).
// Колонка role по умолчанию 'editor', а завести пользователя можно только
// сидом (admin) или руками в базе: если боевого владельца когда-то создали без
// явной роли, после выкатки он потерял бы заказы и настройки без возможности
// вернуть их из интерфейса. Поэтому, если в таблице нет ни одного admin,
// самый старый пользователь становится admin. Есть admin — ничего не меняется.
export class EnsureOneAdminUser1790810000000 implements MigrationInterface {
  name = 'EnsureOneAdminUser1790810000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "admin_users" SET "role" = 'admin'
       WHERE "id" = (SELECT "id" FROM "admin_users" ORDER BY "created_at" ASC, "id" ASC LIMIT 1)
         AND NOT EXISTS (SELECT 1 FROM "admin_users" WHERE "role" = 'admin')
    `)
  }

  // Назад не откатываем: кто был повышен, неизвестно, а понижение владельца
  // оставило бы систему без admin.
  public async down(): Promise<void> {}
}
