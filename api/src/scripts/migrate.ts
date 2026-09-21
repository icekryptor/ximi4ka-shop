// Накат миграций в контейнере: `docker compose exec ximishop-api node api/dist/scripts/migrate.js`.
// Отдельный скрипт, а не старт сервера: миграции должны быть явным шагом
// деплоя, а не побочным эффектом рестарта (два инстанса не должны гонять их
// наперегонки). TypeORM CLI здесь не годится — он требует tsx и .ts-конфиг,
// которых в рантайм-образе нет.
import 'reflect-metadata'
import { AppDataSource } from '../config/dataSource.js'

async function main() {
  await AppDataSource.initialize()
  const applied = await AppDataSource.runMigrations()
  if (applied.length === 0) {
    console.log('миграции: нечего накатывать')
  } else {
    for (const migration of applied) console.log(`миграция применена: ${migration.name}`)
  }
  await AppDataSource.destroy()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
