import type { MigrationInterface, QueryRunner } from 'typeorm'

// Возит ли тариф ПВЗ СДЭК в город (lib/ycp/cityTariff.ts): кеш проверок
// калькулятором, чтобы список пунктов выдачи для Яндекса не опрашивал СДЭК по
// ~6 тыс. городов при каждом обновлении. Ключ с тарифом — смена
// CDEK_TARIFF_PVZ не подсунет чужие ответы.
export class AddYcpCityTariffChecks1790880000000 implements MigrationInterface {
  name = 'AddYcpCityTariffChecks1790880000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ycp_city_tariff_checks" (
        "tariff_code" integer NOT NULL,
        "city_code" integer NOT NULL,
        "served" boolean NOT NULL,
        "checked_at" timestamptz NOT NULL,
        CONSTRAINT "PK_ycp_city_tariff_checks" PRIMARY KEY ("tariff_code", "city_code")
      )`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ycp_city_tariff_checks"`)
  }
}
