import type { MigrationInterface, QueryRunner } from 'typeorm'

// Флаг «вошёл с паролем по умолчанию из сида»: интерфейс админки показывает
// баннер «смените пароль», пока пароль не сменят. Старые строки: false.
export class AddAdminMustChangePassword1790820000000 implements MigrationInterface {
  name = 'AddAdminMustChangePassword1790820000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "must_change_password" boolean NOT NULL DEFAULT false`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admin_users" DROP COLUMN IF EXISTS "must_change_password"`,
    )
  }
}
