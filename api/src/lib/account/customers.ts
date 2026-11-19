import type { EntityManager } from 'typeorm'
import { Customer } from '../../entities/Customer.js'
import { accrueCashbackForCustomer } from '../coins/cashback.js'

export interface TelegramIdentity {
  id: number
  username: string | null
  firstName: string | null
}

// Тот же покупатель по telegram_id — обновляем username и время входа.
// Гонка (двойной опрос) — как в findOrCreateByEmail: проигравший перечитывает.
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
  // Гонка двух входов одним telegram_id: INSERT … ON CONFLICT DO NOTHING
  // (orIgnore) вместо insert+catch — неудачный insert без ON CONFLICT
  // переводит транзакцию в aborted (25P02), и повторный SELECT внутри той же
  // транзакции падает следом, а не находит победителя.
  await repo
    .createQueryBuilder()
    .insert()
    .into(Customer)
    .values({
      telegramId: tg.id,
      telegramUsername: tg.username,
      name: tg.firstName,
      lastLoginAt: new Date(),
    })
    .orIgnore()
    .execute()
  return repo.findOneByOrFail({ telegramId: tg.id })
}

export async function findOrCreateByEmail(em: EntityManager, email: string): Promise<Customer> {
  const repo = em.getRepository(Customer)
  const existing = await repo.findOneBy({ email })
  if (existing) return existing
  // Гонка двух входов на один адрес — см. комментарий в findOrCreateByTelegram.
  await repo.createQueryBuilder().insert().into(Customer).values({ email }).orIgnore().execute()
  return repo.findOneByOrFail({ email })
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
  // Выдачи материалов гостю по тому же email (спека «Мои материалы»).
  await em.query(
    `UPDATE material_grants SET customer_id = $1
     WHERE customer_id IS NULL AND email = $2`,
    [customerId, email],
  )
  // Гостевой заказ мог быть получен ещё до входа — кэшбек по нему начисляем сейчас.
  await accrueCashbackForCustomer(em, customerId)
}

// Слияние аккаунтов (спека §4.5): пользователь только что доказал владение
// обоими. Вызывать внутри транзакции. Сессии удаляемого уходят каскадом.
export async function mergeCustomers(
  em: EntityManager,
  keepId: string,
  dropId: string,
): Promise<void> {
  if (keepId === dropId) return
  const repo = em.getRepository(Customer)
  // Порядок блокировок как у начисления/отзыва кэшбека: сначала строки заказов, потом
  // строки покупателей (по возрастанию id) — иначе взаимная блокировка с параллельной
  // сменой статуса заказа.
  await em.query('SELECT id FROM orders WHERE customer_id IN ($1, $2) ORDER BY id FOR UPDATE', [
    keepId,
    dropId,
  ])
  const locked: { id: string; coin_balance: number }[] = await em.query(
    'SELECT id, coin_balance FROM customers WHERE id IN ($1, $2) ORDER BY id FOR UPDATE',
    [keepId, dropId],
  )
  const dropCoins = locked.find((r) => r.id === dropId)?.coin_balance ?? 0
  const keep = await repo.findOneByOrFail({ id: keepId })
  const drop = await repo.findOneByOrFail({ id: dropId })
  await em.query('UPDATE orders SET customer_id = $1 WHERE customer_id = $2', [keepId, dropId])
  await em.query('UPDATE material_grants SET customer_id = $1 WHERE customer_id = $2', [
    keepId,
    dropId,
  ])
  // След для клиентов ximi4ka ID (learn): они знают покупателя по id, и после
  // слияния должны найти свою связь по прежнему id. Старые следы удаляемого
  // тоже переезжают на keep — цепочка слияний не рвётся.
  await em.query('UPDATE customer_aliases SET customer_id = $1 WHERE customer_id = $2', [
    keepId,
    dropId,
  ])
  await em.query(
    `INSERT INTO customer_aliases (former_id, customer_id) VALUES ($1, $2)
     ON CONFLICT (former_id) DO UPDATE SET customer_id = EXCLUDED.customer_id`,
    [dropId, keepId],
  )
  // История монет переезжает на keep ДО удаления (внешний ключ без каскада), баланс —
  // сырым SQL: coinBalance в сущности `update: false`, save(keep) его не запишет. Новых
  // записей журнала слияние не создаёт — сумма истории остаётся равной балансу.
  await em.query('UPDATE coin_transactions SET customer_id = $1 WHERE customer_id = $2', [
    keepId,
    dropId,
  ])
  // Сначала удаляем, потом заполняем keep — иначе уникальные email/telegram_id столкнутся.
  await repo.delete({ id: dropId })
  if (dropCoins > 0) {
    await em.query('UPDATE customers SET coin_balance = coin_balance + $1 WHERE id = $2', [
      dropCoins,
      keepId,
    ])
  }
  keep.email ??= drop.email
  // telegramId и telegramUsername — пара: username чужого telegram_id не
  // подходит текущему, поэтому переносим их только вместе.
  if (keep.telegramId == null) {
    keep.telegramId = drop.telegramId
    keep.telegramUsername = drop.telegramUsername
  }
  keep.name ??= drop.name
  keep.phone ??= drop.phone
  await repo.save(keep)
}

export async function attachEmail(
  em: EntityManager,
  customerId: string,
  email: string,
): Promise<void> {
  const repo = em.getRepository(Customer)
  const owner = await repo.findOneBy({ email })
  if (owner && owner.id !== customerId) await mergeCustomers(em, customerId, owner.id)
  await repo.update({ id: customerId }, { email })
  await claimOrdersByEmail(em, customerId, email)
}

export type AttachTelegramResult = { ok: true } | { ok: false; reason: 'conflict' }

// Привязка Telegram, в отличие от attachEmail, НИКОГДА не сливает аккаунты:
// иначе злоумышленник, вошедший как A и приславший жертве свою ссылку на
// привязку, получил бы аккаунт жертвы себе, как только та нажмёт
// «Привязать». Если telegram_id уже занят другим — просто конфликт.
export async function attachTelegram(
  em: EntityManager,
  customerId: string,
  tg: TelegramIdentity,
): Promise<AttachTelegramResult> {
  const repo = em.getRepository(Customer)
  const owner = await repo.findOneBy({ telegramId: tg.id })
  if (owner && owner.id !== customerId) return { ok: false, reason: 'conflict' }
  await repo.update({ id: customerId }, { telegramId: tg.id, telegramUsername: tg.username })
  return { ok: true }
}
