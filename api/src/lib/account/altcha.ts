import { createHmac, randomBytes } from 'node:crypto'
import { CappedMap, createChallenge, randomInt, type Challenge } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2'
import { verify } from 'altcha-lib/frameworks/shared'

// Защита отправки кода на почту от ботов (ALTCHA, proof-of-work, без сторонних
// сервисов). С 29.10.2026 скрипты подставляли в форму входа чужие адреса — так
// «бомбят» почту жертв через тысячи сайтов; жалобы на спам кончились тем, что
// Яндекс отключил нашему ящику SMTP. Такие скрипты шлют POST напрямую, без
// браузера: задача, которую решает JS формы, их отсекает, а человек её не видит.
//
// Секрет подписи: ALTCHA_HMAC_SECRET или случайный на запуск процесса. api —
// один контейнер, а задача живёт 10 минут: после перезапуска форма просто
// попросит новую, настраивать ничего не нужно.

const CHALLENGE_TTL_MS = 10 * 60 * 1000
const ALGORITHM = 'PBKDF2/SHA-256'

const signatureSecret = process.env.ALTCHA_HMAC_SECRET?.trim() || randomBytes(32).toString('hex')
const keySignatureSecret = createHmac('sha256', signatureSecret).update('altcha-key').digest('hex')

// Использованные задачи (защита от повтора одного решения). Хранить дольше срока
// жизни задачи незачем; 50 000 — с огромным запасом на 10 минут живых запросов.
const used = new CappedMap<string, boolean>({ maxSize: 50_000 })

// Стоимость одной попытки. 1000 итераций PBKDF2 × 1000–2000 попыток — около 0,2 с
// на ноутбуке и ~1 с на слабом телефоне. В тестах ALTCHA_COST=1.
function cost(): number {
  const n = Number(process.env.ALTCHA_COST)
  return Number.isInteger(n) && n > 0 && n <= 100_000 ? n : 1000
}

export async function createLoginChallenge(now = new Date()): Promise<Challenge> {
  return createChallenge({
    algorithm: ALGORITHM,
    cost: cost(),
    counter: randomInt(1000, 2000),
    deriveKey,
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
    hmacSignatureSecret: signatureSecret,
    hmacKeySignatureSecret: keySignatureSecret,
  })
}

export type AltchaCheck = { ok: true } | { ok: false; reason: 'missing' | 'failed' }

// Проверяет поле `altcha` формы: base64(JSON { challenge, solution }). Подпись,
// срок, само решение и одноразовость — всё внутри verify из altcha-lib.
export async function verifyLoginAltcha(payload: unknown): Promise<AltchaCheck> {
  if (typeof payload !== 'string' || payload.length === 0) return { ok: false, reason: 'missing' }
  if (payload.length > 4096) return { ok: false, reason: 'failed' }
  const result = await verify(payload, deriveKey, signatureSecret, keySignatureSecret, used)
  return result.error === null ? { ok: true } : { ok: false, reason: 'failed' }
}
