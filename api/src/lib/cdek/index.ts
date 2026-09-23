import { CdekClient, CdekError } from './client.js'

export { CdekClient, CdekError, PUBLIC_TEST_CREDENTIALS } from './client.js'

// Один клиент на процесс: в нём живёт кеш токена, и новый клиент на каждый
// запрос означал бы новый токен на каждый запрос (так делает официальный
// service.php, и СДЭК это заметно замедляет).
let client: CdekClient | null = null
let override: Pick<CdekClient, 'get' | 'post' | 'raw'> | null = null

// Под тестами без явной подмены сеть не трогаем: клиент «недоступен», и
// расчёт доставки уходит в фиксированную ставку.
const offline: Pick<CdekClient, 'get' | 'post' | 'raw'> = {
  get: () => Promise.reject(new CdekError(0, 'offline', 'СДЭК отключён в тестах')),
  post: () => Promise.reject(new CdekError(0, 'offline', 'СДЭК отключён в тестах')),
  raw: () => Promise.reject(new CdekError(0, 'offline', 'СДЭК отключён в тестах')),
}

export function getCdekClient(): Pick<CdekClient, 'get' | 'post' | 'raw'> {
  if (override) return override
  if (process.env.VITEST) return offline
  client ??= CdekClient.fromEnv()
  return client
}

export function setCdekClientForTests(c: Pick<CdekClient, 'get' | 'post' | 'raw'> | null): void {
  override = c
}
