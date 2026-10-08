import type { MigrationInterface, QueryRunner } from 'typeorm'

// В Telegram уходит только карточка оплаченного заказа (channelsForEvent).
// Неотправленные карточки «создан» удаляем, чтобы после выкатки в чат не
// пришёл хвост по заказам, которые ещё не оплачены.
export class DropTelegramCreatedCards1790760000000 implements MigrationInterface {
  name = 'DropTelegramCreatedCards1790760000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "order_notifications"
       WHERE "channel" = 'telegram' AND "event_key" = 'created' AND "sent_at" IS NULL`,
    )
  }

  // Удалены только неотправленные карточки — восстанавливать нечего.
  public async down(): Promise<void> {}
}
