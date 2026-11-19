import { randomUUID } from 'node:crypto'
import { AppDataSource } from '../../config/dataSource.js'
import { TelegramLoginRequest } from '../../entities/TelegramLoginRequest.js'
import { Customer } from '../../entities/Customer.js'
import type { TelegramLoginBot } from '../telegram/loginBot.js'
import { hashSessionToken } from '../../routes/middleware/requireAdminAuth.js'
import { maskEmail } from '../mail/mailer.js'
import { SUPPORT_TELEGRAM_URL, TG_LOGIN_TTL_MS } from '../../routes/account/constants.js'
import { newToken } from './session.js'

// Минимум полей update, которые мы читаем.
export interface TelegramUser {
  id: number
  username?: string
  first_name?: string
}
export interface TelegramUpdate {
  message?: {
    message_id: number
    chat: { id: number; type: string }
    from?: TelegramUser
    text?: string
  }
  callback_query?: {
    id: string
    from: TelegramUser
    message?: { message_id: number; chat: { id: number } }
    data?: string
  }
}

const SITE = 'ximi4ka.ru'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function createTelegramLoginRequest(
  linkCustomerId: string | null,
): Promise<{ nonce: string; pollSecret: string }> {
  const nonce = newToken() // 43 символа base64url — в лимит 64 параметра start
  const pollSecret = newToken()
  const now = new Date()
  await AppDataSource.getRepository(TelegramLoginRequest).insert({
    id: randomUUID(),
    nonceHash: hashSessionToken(nonce),
    pollSecretHash: hashSessionToken(pollSecret),
    status: 'pending',
    telegramId: null,
    telegramUsername: null,
    telegramFirstName: null,
    linkCustomerId,
    expiresAt: new Date(now.getTime() + TG_LOGIN_TTL_MS),
    createdAt: now,
  })
  return { nonce, pollSecret }
}

function isLive(r: TelegramLoginRequest | null): r is TelegramLoginRequest {
  return !!r && r.status === 'pending' && r.expiresAt.getTime() > Date.now()
}

// Повтор от того же Telegram после «Подтвердить»: вкладка t.me в Safari снова
// открывает бота с тем же start, кнопку жмут второй раз, пока медленный
// Telegram не ответил. Человек уже вошёл — «Ссылка устарела» его только пугает.
// Чужому Telegram по-прежнему отвечаем «устарела», без подробностей.
function isConfirmedBy(r: TelegramLoginRequest | null, telegramId: number): boolean {
  return !!r && (r.status === 'confirmed' || r.status === 'consumed') && r.telegramId === telegramId
}

const START_STALE_TEXT = `Ссылка устарела — начните вход на сайте ${SITE} заново.`
const START_DONE_TEXT = `Вы уже подтвердили — вернитесь на сайт ${SITE}. Если там ничего не произошло, начните заново.`
const BUTTON_STALE_TEXT = 'Ссылка устарела — начните заново на сайте'
const BUTTON_DONE_TEXT = 'Уже подтверждено — вернитесь на сайт'

// Ошибки Telegram не пробрасываем: webhook отвечает 200 всегда, иначе
// Telegram будет повторять тот же update.
async function safe(what: string, p: Promise<void>): Promise<void> {
  try {
    await p
  } catch (err) {
    console.error(`telegram login: ${what} — ${(err as Error).message}`)
  }
}

// Кому уходит привязка — называем аккаунт в запросе на подтверждение,
// иначе получивший чужую ссылку на привязку не поймёт, что привязывает
// Telegram не себе, а тому, кто прислал ссылку.
async function linkTargetLabel(customerId: string): Promise<string> {
  const customer = await AppDataSource.getRepository(Customer).findOneBy({ id: customerId })
  if (customer?.email) return maskEmail(customer.email)
  if (customer?.name) return customer.name
  return 'без имени'
}

export async function handleTelegramUpdate(
  bot: TelegramLoginBot,
  update: TelegramUpdate,
): Promise<void> {
  const repo = AppDataSource.getRepository(TelegramLoginRequest)

  const msg = update.message
  if (msg?.from && msg.chat.type === 'private') {
    const start = msg.text?.match(/^\/start(?:\s+(\S+))?\s*$/)
    const nonce = start?.[1]
    if (!nonce) {
      await safe(
        'подсказка',
        bot.sendMessage(
          msg.chat.id,
          `Это бот для входа на ${SITE}. Чтобы войти, нажмите «Войти через Telegram» на сайте. Вопросы — в поддержку.`,
          [[{ text: 'Написать в поддержку', url: SUPPORT_TELEGRAM_URL }]],
        ),
      )
      return
    }
    const req = await repo.findOneBy({ nonceHash: hashSessionToken(nonce) })
    if (!isLive(req)) {
      await safe(
        'ссылка устарела',
        bot.sendMessage(
          msg.chat.id,
          isConfirmedBy(req, msg.from.id) ? START_DONE_TEXT : START_STALE_TEXT,
        ),
      )
      return
    }
    // Запоминаем, кто нажал «Старт»: подтвердить сможет только он. Условие
    // status: 'pending' в UPDATE закрывает гонку с параллельным «Подтвердить»
    // (TOCTOU: без него интерливинг двух апдейтов мог привести к тому, что
    // подтверждённая заявка получит telegramId нажавшего «Старт» позже).
    const started = await repo.update(
      { id: req.id, status: 'pending' },
      { telegramId: msg.from.id },
    )
    if (started.affected !== 1) {
      const fresh = await repo.findOneBy({ id: req.id })
      await safe(
        'ссылка устарела (гонка со «Старт»)',
        bot.sendMessage(
          msg.chat.id,
          isConfirmedBy(fresh, msg.from.id) ? START_DONE_TEXT : START_STALE_TEXT,
        ),
      )
      return
    }
    const linking = req.linkCustomerId !== null
    const prompt = linking
      ? `Привязать этот Telegram к аккаунту ${await linkTargetLabel(req.linkCustomerId!)} на ${SITE}? Если вы не начинали привязку — просто проигнорируйте это сообщение.`
      : `Войти на сайт ${SITE}? Если вы не начинали вход, просто проигнорируйте это сообщение.`
    await safe(
      'запрос подтверждения',
      bot.sendMessage(msg.chat.id, prompt, [
        [{ text: linking ? 'Привязать' : 'Подтвердить вход', callback_data: `login:${req.id}` }],
      ]),
    )
    return
  }

  const cb = update.callback_query
  if (cb?.data?.startsWith('login:')) {
    const id = cb.data.slice('login:'.length)
    const req = UUID_RE.test(id) ? await repo.findOneBy({ id }) : null
    if (!isLive(req) || req.telegramId !== cb.from.id) {
      await safe(
        'ответ на кнопку',
        bot.answerCallbackQuery(
          cb.id,
          isConfirmedBy(req, cb.from.id) ? BUTTON_DONE_TEXT : BUTTON_STALE_TEXT,
        ),
      )
      return
    }
    // telegramId: cb.from.id в UPDATE — то же условие, что мы уже проверили
    // выше, но атомарно: если между проверкой и записью «Старт» переписал
    // telegramId (тот же TOCTOU, что и в ветке /start), affected будет 0, и
    // мы не подтверждаем чужой запрос.
    const confirmed = await repo.update(
      { id: req.id, status: 'pending', telegramId: cb.from.id },
      {
        status: 'confirmed',
        telegramUsername: cb.from.username ?? null,
        telegramFirstName: cb.from.first_name ?? null,
      },
    )
    if (confirmed.affected !== 1) {
      const fresh = await repo.findOneBy({ id: req.id })
      await safe(
        'ответ на кнопку (гонка со «Старт»)',
        bot.answerCallbackQuery(
          cb.id,
          isConfirmedBy(fresh, cb.from.id) ? BUTTON_DONE_TEXT : BUTTON_STALE_TEXT,
        ),
      )
      return
    }
    await safe('ответ на кнопку', bot.answerCallbackQuery(cb.id, 'Готово'))
    if (cb.message) {
      await safe(
        'правка сообщения',
        bot.editMessageText(
          cb.message.chat.id,
          cb.message.message_id,
          'Готово — вернитесь на сайт.',
        ),
      )
    }
  }
}

// Атомарно переводит confirmed → consumed: из двух параллельных опросов
// сессию получит только один (второй увидит expired).
export async function consumeConfirmedRequest(
  pollSecret: string,
): Promise<
  { status: 'pending' | 'expired' } | { status: 'confirmed'; request: TelegramLoginRequest }
> {
  const repo = AppDataSource.getRepository(TelegramLoginRequest)
  const req = await repo.findOneBy({ pollSecretHash: hashSessionToken(pollSecret) })
  if (!req || req.expiresAt.getTime() <= Date.now() || req.status === 'consumed') {
    return { status: 'expired' }
  }
  if (req.status === 'pending') return { status: 'pending' }
  const result = await repo
    .createQueryBuilder()
    .update(TelegramLoginRequest)
    .set({ status: 'consumed' })
    .where("id = :id AND status = 'confirmed'", { id: req.id })
    .execute()
  if (result.affected !== 1) return { status: 'expired' }
  return { status: 'confirmed', request: req }
}
