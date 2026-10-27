// Пробный запрос к Метрике и Вебмастеру с токеном YANDEX_STATS_OAUTH_TOKEN:
// какие имена измерений принимаются и сколько истории отдаёт Вебмастер.
// Ничего не пишет в базу, кроме чтения настроек сайта. Локально:
//   npm run search-stats:probe -w api
// В контейнере:
//   docker compose exec ximishop-api node api/dist/scripts/search-stats-probe.js
import 'dotenv/config'
import 'reflect-metadata'
import { AppDataSource } from '../config/dataSource.js'
import { resolveCounterId } from '../lib/metrika/worker.js'
import { addDays, todayMsk } from '../lib/searchStats/dates.js'
import { MetrikaReportsClient } from '../lib/searchStats/metrikaReports.js'
import { runMetrikaProbe, runWebmasterProbe } from '../lib/searchStats/probe.js'

async function main() {
  const token = process.env.YANDEX_STATS_OAUTH_TOKEN?.trim()
  if (!token) {
    console.error('YANDEX_STATS_OAUTH_TOKEN не задан')
    process.exitCode = 1
    return
  }
  await AppDataSource.initialize()
  try {
    const today = todayMsk(new Date())
    const counterId = await resolveCounterId(process.env)
    const metrika = counterId
      ? await runMetrikaProbe(new MetrikaReportsClient({ token }), counterId, addDays(today, -1))
      : 'номер счётчика не задан (настройки сайта или METRIKA_COUNTER_ID)'
    const webmaster = await runWebmasterProbe((input, init) => fetch(input, init), token, today)
    console.log(JSON.stringify({ day: addDays(today, -1), counterId, metrika, webmaster }, null, 2))
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
