import type { EntityManager } from 'typeorm'
import { Customer } from '../../entities/Customer.js'

export interface TelegramIdentity {
  id: number
  username: string | null
  firstName: string | null
}

// Тот же покупатель по telegram_id — обновляем username и время входа.
// Гонка (двойной опрос) — как в findOrCreateByEmail: проигравший читает снова.
export async function findOrCreateByTelegram(
  em: EntityManager,
  tg: TelegramIdentity,
): Promise<Customer> {
  const repo = em.getRepository(Customer)
  const existing = await repo.findOneBy({ telegramId: tg.id })
  if (existing) {
    existing.telegramUsername = tg.username
    existing.lastLoginAt = new Date()
    return repo.save(existing)
  }
  try {
    return await repo.save(
      repo.create({
        telegramId: tg.id,
        telegramUsername: tg.username,
        name: tg.firstName,
        lastLoginAt: new Date(),
      }),
    )
  } catch (err) {
    const again = await repo.findOneBy({ telegramId: tg.id })
    if (again) return again
    throw err
  }
}

export async function findOrCreateByEmail(em: EntityManager, email: string): Promise<Customer> {
  const repo = em.getRepository(Customer)
  const existing = await repo.findOneBy({ email })
  if (existing) return existing
  // Гонка двух входов на один адрес: проигравший получит 23505 — тогда читаем снова.
  try {
    return await repo.save(repo.create({ email }))
  } catch (err) {
    const again = await repo.findOneBy({ email })
    if (again) return again
    throw err
  }
}

// Прошлые гостевые заказы с тем же подтверждённым email (спека §4.4). Чужие
// (уже привязанные) не перехватываем, пустой email ('') ни с чем не совпадает.
export async function claimOrdersByEmail(
  em: EntityManager,
  customerId: string,
  email: string,
): Promise<void> {
  await em.query(
    `UPDATE orders SET customer_id = $1
     WHERE customer_id IS NULL AND customer_email <> '' AND lower(customer_email) = $2`,
    [customerId, email],
  )
}
