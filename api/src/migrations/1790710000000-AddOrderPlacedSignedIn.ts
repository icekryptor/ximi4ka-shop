import type { MigrationInterface, QueryRunner } from 'typeorm'

// Личный кабинет (спека кабинета §4.4/автозаполнение): гость может привязать
// неоплаченный заказ к чужому подтверждённому email, лишь угадав его — такой
// заказ не должен считаться источником lastDelivery для владельца аккаунта.
// placed_signed_in истинен только для заказов, оформленных вживую вошедшим
// покупателем (checkout.ts), а не подтянутых по email после оформления.
export class AddOrderPlacedSignedIn1790710000000 implements MigrationInterface {
  name = 'AddOrderPlacedSignedIn1790710000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "placed_signed_in" boolean NOT NULL DEFAULT false`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "placed_signed_in"`)
  }
}
