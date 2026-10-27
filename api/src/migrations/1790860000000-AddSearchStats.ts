import type { MigrationInterface, QueryRunner } from 'typeorm'

// Раздел «Трафик и рост» (spec 2026-10-28-traffic-growth-admin-design):
// журнал синхронизаций и дневные данные Метрики. В traffic_sources_daily
// строки с search_engine = '' — итоги источников; строки source = 'organic'
// с непустым search_engine — разбивка поиска по поисковикам (не суммировать
// с итогами). Пути — без параметров, как orders.attribution.landing.
export class AddSearchStats1790860000000 implements MigrationInterface {
  name = 'AddSearchStats1790860000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "search_stats_sync_runs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "source" varchar(16) NOT NULL,
        "started_at" timestamptz NOT NULL DEFAULT now(),
        "finished_at" timestamptz,
        "status" varchar(8) NOT NULL DEFAULT 'running',
        "error" text,
        "rows" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_search_stats_sync_runs" PRIMARY KEY ("id")
      )`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_search_stats_sync_runs_source_started" ON "search_stats_sync_runs" ("source", "started_at" DESC)`,
    )
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "traffic_sources_daily" (
        "day" date NOT NULL,
        "source" varchar(32) NOT NULL,
        "search_engine" varchar(64) NOT NULL DEFAULT '',
        "visits" integer NOT NULL,
        "users" integer NOT NULL,
        "bounce_rate" numeric(5,2) NOT NULL,
        "page_depth" numeric(6,2) NOT NULL,
        CONSTRAINT "PK_traffic_sources_daily" PRIMARY KEY ("day", "source", "search_engine")
      )`)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "landing_pages_daily" (
        "day" date NOT NULL,
        "path" varchar(300) NOT NULL,
        "source" varchar(32) NOT NULL,
        "visits" integer NOT NULL,
        "users" integer NOT NULL,
        "bounce_rate" numeric(5,2) NOT NULL,
        "page_depth" numeric(6,2) NOT NULL,
        CONSTRAINT "PK_landing_pages_daily" PRIMARY KEY ("day", "path", "source")
      )`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "landing_pages_daily"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "traffic_sources_daily"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "search_stats_sync_runs"`)
  }
}
