import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { AppDataSource } from '../../config/dataSource.js'
import { SsoAuthCode } from '../../entities/SsoAuthCode.js'
import { Customer } from '../../entities/Customer.js'
import { CustomerAlias } from '../../entities/CustomerAlias.js'
import { hashSessionToken } from '../../routes/middleware/requireAdminAuth.js'
import { SSO_CODE_TTL_MS } from '../../routes/account/constants.js'
import { newToken } from './session.js'

// ximi4ka ID (спека 2026-09-29-ximi4ka-id-sso-design.md): магазин — провайдер
// входа, XimiLearn — клиент. Клиенты свои, первые: экрана согласия нет,
// список зашит в код, секреты и адреса возврата — в окружении.
export interface SsoClient {
  id: string
  secret: string
  // Точное совпадение, без префиксов и шаблонов: иначе открытый редирект.
  redirectUris: string[]
}

const KNOWN_CLIENTS = ['learn'] as const

// Секрет короче 32 символов — клиент выключен: такой секрет перебирается.
const MIN_SECRET_LENGTH = 32

function clientsFromEnv(env: NodeJS.ProcessEnv = process.env): SsoClient[] {
  const clients: SsoClient[] = []
  for (const id of KNOWN_CLIENTS) {
    const key = id.toUpperCase()
    const secret = env[`SSO_${key}_CLIENT_SECRET`] ?? ''
    const redirectUris = (env[`SSO_${key}_REDIRECT_URIS`] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (secret.length >= MIN_SECRET_LENGTH && redirectUris.length > 0) {
      clients.push({ id, secret, redirectUris })
    }
  }
  return clients
}

let override: SsoClient[] | null = null

export function setSsoClientsForTests(clients: SsoClient[] | null): void {
  override = clients
}

export function getSsoClient(id: string): SsoClient | null {
  return (override ?? clientsFromEnv()).find((c) => c.id === id) ?? null
}

export function isAllowedRedirect(client: SsoClient, redirectUri: string): boolean {
  return client.redirectUris.includes(redirectUri)
}

// Сравнение секретов за постоянное время: хэшируем оба, чтобы длины совпали.
export function secretMatches(client: SsoClient, candidate: string): boolean {
  const a = createHash('sha256').update(client.secret).digest()
  const b = createHash('sha256').update(candidate).digest()
  return timingSafeEqual(a, b)
}

export async function issueSsoCode(
  clientId: string,
  redirectUri: string,
  customerId: string,
  now = new Date(),
): Promise<string> {
  const code = newToken()
  await AppDataSource.getRepository(SsoAuthCode).insert({
    id: randomUUID(),
    codeHash: hashSessionToken(code),
    clientId,
    redirectUri,
    customerId,
    expiresAt: new Date(now.getTime() + SSO_CODE_TTL_MS),
    consumedAt: null,
    createdAt: now,
  })
  return code
}

export interface SsoIdentity {
  customer: {
    id: string
    email: string | null
    telegramId: number | null
    telegramUsername: string | null
    name: string | null
  }
  // Прежние id этого покупателя (слияния аккаунтов) — по ним клиент находит
  // связь, заведённую до слияния.
  formerIds: string[]
}

// Атомарно гасит код: из двух параллельных обменов данные получит только
// один. Код привязан к клиенту и адресу возврата, с которыми его выдали.
export async function exchangeSsoCode(
  clientId: string,
  redirectUri: string,
  code: string,
): Promise<SsoIdentity | null> {
  const result = await AppDataSource.createQueryBuilder()
    .update(SsoAuthCode)
    .set({ consumedAt: () => 'now()' })
    .where(
      'code_hash = :hash AND consumed_at IS NULL AND expires_at > now() AND client_id = :clientId AND redirect_uri = :redirectUri',
      { hash: hashSessionToken(code), clientId, redirectUri },
    )
    .returning('customer_id')
    .execute()
  const customerId = (result.raw as { customer_id: string }[])[0]?.customer_id
  if (!customerId) return null
  const customer = await AppDataSource.getRepository(Customer).findOneBy({ id: customerId })
  if (!customer) return null
  const aliases = await AppDataSource.getRepository(CustomerAlias).find({
    where: { customerId },
    order: { mergedAt: 'ASC' },
  })
  return {
    customer: {
      id: customer.id,
      email: customer.email,
      telegramId: customer.telegramId,
      telegramUsername: customer.telegramUsername,
      name: customer.name,
    },
    formerIds: aliases.map((a) => a.formerId),
  }
}
