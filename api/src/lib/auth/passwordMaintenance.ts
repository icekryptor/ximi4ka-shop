import { randomBytes } from 'node:crypto'
import argon2 from 'argon2'
import { IsNull } from 'typeorm'
import { AppDataSource } from '../../config/dataSource.js'
import { AdminSession } from '../../entities/AdminSession.js'
import { AdminUser } from '../../entities/AdminUser.js'
import { DEFAULT_SEED_PASSWORD } from '../../routes/auth/constants.js'

// Проверка при старте api: у кого из пользователей админки до сих пор пароль
// по умолчанию из сида (он лежит в репозитории, то есть публичен). Таких
// помечаем (баннер «смените пароль» появится при входе, даже если с этим
// паролем ещё никто не заходил) и называем в логе. Заодно снимаем застрявший
// флаг у тех, чей пароль уже сменён в обход интерфейса. Возвращает email
// помеченных.
export async function flagDefaultPasswordUsers(): Promise<string[]> {
  const repo = AppDataSource.getRepository(AdminUser)
  const flagged: string[] = []
  for (const user of await repo.find()) {
    // Битый хэш одного пользователя не должен мешать проверить остальных.
    const isDefault = await argon2
      .verify(user.passwordHash, DEFAULT_SEED_PASSWORD)
      .catch(() => false)
    if (isDefault) flagged.push(user.email)
    if (isDefault !== user.mustChangePassword) {
      await repo.update({ id: user.id }, { mustChangePassword: isDefault })
    }
  }
  if (flagged.length > 0) {
    console.warn(
      'admin: у пользователей пароль по умолчанию из сида, смените его в админке или командой reset-admin-password:',
      flagged,
    )
  }
  return flagged
}

// Серверный сброс пароля: владелец заблокирован или хочет заменить слабый
// пароль, не заходя в интерфейс. Задаёт случайный пароль, отзывает все сессии
// пользователя, снимает флаг. Пароль возвращается один раз, нигде не хранится
// и не логируется.
export async function resetAdminPassword(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase()
  const password = randomBytes(18).toString('base64url')
  const passwordHash = await argon2.hash(password)
  await AppDataSource.transaction(async (em) => {
    const user = await em.findOneBy(AdminUser, { email: normalized })
    if (!user) throw new Error(`пользователь админки ${normalized} не найден`)
    await em.update(AdminUser, { id: user.id }, { passwordHash, mustChangePassword: false })
    await em.update(
      AdminSession,
      { adminUserId: user.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    )
  })
  return password
}
