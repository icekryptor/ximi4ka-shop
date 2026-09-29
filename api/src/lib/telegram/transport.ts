import { Agent, fetch as undiciFetch } from 'undici'

// Сеть до api.telegram.org с нашего VPS (docs: deploy/README.md, «Как бот
// получает сообщения»):
// - IPv4 закрыт, работает только IPv6;
// - простаивающие соединения рвутся посреди пути — keep-alive-сокет,
//   переиспользованный после паузы, падает с «fetch failed».
// Отдельный undici Agent только для Telegram: IPv6 первым и 5 с на попытку
// (не 250 мс по умолчанию), и сокет не живёт дольше пары секунд простоя —
// новый запрос открывает свежее соединение, а не идёт в мёртвое.
// fetch и Agent — из одного пакета undici (см. payments/tbankTransport.ts).

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const KEEP_ALIVE_MS = 2_000
const CONNECT_TIMEOUT_MS = 10_000

let dispatcher: Agent | null = null
function getDispatcher(): Agent {
  if (!dispatcher) {
    dispatcher = new Agent({
      keepAliveTimeout: KEEP_ALIVE_MS,
      keepAliveMaxTimeout: KEEP_ALIVE_MS,
      connect: {
        timeout: CONNECT_TIMEOUT_MS,
        autoSelectFamily: true,
        autoSelectFamilyAttemptTimeout: 5_000,
      },
    })
  }
  return dispatcher
}

export const telegramFetch: Fetch = (input, init) =>
  undiciFetch(input, { ...init, dispatcher: getDispatcher() } as unknown as Parameters<
    typeof undiciFetch
  >[1]) as unknown as Promise<Response>

// «fetch failed» ничего не говорит — достаём код из cause (ECONNRESET,
// UND_ERR_CONNECT_TIMEOUT, UND_ERR_SOCKET…), чтобы в логе была причина.
export function describeNetworkError(err: unknown): string {
  const e = err as { name?: string; message?: string; cause?: { code?: string; message?: string } }
  const cause = e?.cause?.code ?? e?.cause?.message
  return cause ? `${e?.message ?? 'fetch failed'} (${cause})` : (e?.message ?? String(err))
}

// Сбой до ответа сервера: соединение не открылось или оборвалось. Такой
// запрос безопасно повторить один раз.
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err as { name?: string })?.name === 'TimeoutError'
}
