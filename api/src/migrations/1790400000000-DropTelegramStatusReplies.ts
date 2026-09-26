import type { MigrationInterface, QueryRunner } from 'typeorm'

// Ответы-статусы в Telegram отключены (docs/superpowers/specs/2026-09-25-cdek-auto-orders-design.md §6).
// Неотправленные записи удаляем, чтобы после выкатки в чат не пришёл их хвост.
export class DropTelegramStatusReplies1790400000000 implements MigrationInterface {
  name = 'DropTelegramStatusReplies1790400000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "order_notifications"
       WHERE "channel" = 'telegram' AND "event_key" <> 'created' AND "sent_at" IS NULL`,
    )
  }

  // Удалены только неотправленные ответы — восстанавливать нечего.
  public async down(): Promise<void> {}
}
