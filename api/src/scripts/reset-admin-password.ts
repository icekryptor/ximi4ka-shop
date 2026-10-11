// Сброс пароля пользователя админки на сервере. Если владелец заблокирован
// или хочет заменить слабый пароль, не заходя в интерфейс:
//   docker compose exec ximishop-api node api/dist/scripts/reset-admin-password.js owner@example.com
// Локально:
//   npm run admin:reset-password -w api -- owner@example.com
// Печатает новый случайный пароль один раз (нигде не сохраняется) и отзывает все
// сессии пользователя. Войдите с ним и сразу смените на свой: «Сменить пароль».
import 'reflect-metadata'
import 'dotenv/config'
import { AppDataSource } from '../config/dataSource.js'
import { resetAdminPassword } from '../lib/auth/passwordMaintenance.js'

async function main() {
  const email = process.argv[2]
  if (!email) throw new Error('укажите email: reset-admin-password.js owner@example.com')
  await AppDataSource.initialize()
  try {
    const password = await resetAdminPassword(email)
    console.log(`Новый пароль для ${email.trim().toLowerCase()}: ${password}`)
    console.log('Войдите с ним и сразу смените на свой (Сменить пароль в шапке админки).')
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
