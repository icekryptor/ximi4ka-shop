import fs from 'node:fs'
import path from 'node:path'
import tls from 'node:tls'
import { fileURLToPath } from 'node:url'
import { Agent, fetch as undiciFetch } from 'undici'

// Т-Банк (securepay.tinkoff.ru) отдаёт цепочку сертификатов через
// российский УЦ: *.tinkoff.ru → Russian Trusted Sub CA → Russian Trusted
// Root CA (Минцифры). Этого корня нет в наборе root-сертификатов Node —
// обычный fetch падает с SELF_SIGNED_CERT_IN_CHAIN.
//
// Доверяем этому корню НЕ глобально (через NODE_EXTRA_CA_CERTS — это
// повлияло бы на весь процесс, включая СДЭК/Telegram/Google/Supabase), а
// только для запросов к Т-Банку: отдельный undici Agent со своим
// TLS-контекстом (системные корни Node + один этот корень).
//
// Node'овский global fetch собран из undici, версия которого зашита в сам
// рантайм и отличается между Node 22 и 24 — передавать ему чужой Agent
// (из отдельно установленного пакета undici) небезопасно. Поэтому здесь
// используем `fetch` и `Agent` из одного и того же пакета `undici`.

// src/lib/payments/ → src/lib/ → src/ → api/, +certs. dist/lib/payments/
// резолвится туда же (dist/ — соседняя с src/ директория внутри api/), так
// путь работает одинаково и под tsx (src/), и в собранном виде (dist/) —
// см. api/src/lib/storage/index.ts (UPLOADS_DIR) для того же приёма.
const thisDir = path.dirname(fileURLToPath(import.meta.url))
const CERT_PATH = path.resolve(thisDir, '../../../certs/russian_trusted_root_ca.pem')

// SHA-256 отпечаток сертификата (проверен контроллером против цепочки,
// которую реально отдаёт securepay.tinkoff.ru).
export const TBANK_ROOT_CA_FINGERPRINT =
  'D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31'

// Файл читается лениво, при первом запросе к Т-Банку, а не при импорте
// модуля: tbank.ts (а с ним и tbankTransport.ts) импортируется через
// payments/index.ts и вебхук-роут при любом PAYMENT_PROVIDER, в том числе
// 'manual' — отсутствующий PEM не должен ронять запуск всего API.
let tbankRootCaPem: string | null = null
function getTbankRootCaPem(): string {
  if (tbankRootCaPem === null) {
    tbankRootCaPem = fs.readFileSync(CERT_PATH, 'utf8')
  }
  return tbankRootCaPem
}

export function getTbankCaList(): string[] {
  return [...tls.rootCertificates, getTbankRootCaPem()]
}

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>

let dispatcher: Agent | null = null
function getDispatcher(): Agent {
  if (!dispatcher) {
    dispatcher = new Agent({ connect: { ca: getTbankCaList() } })
  }
  return dispatcher
}

// undici-fetch типизирован своими Request/Response/RequestInit — они
// структурно почти совпадают с глобальными (@types/node), но не идентичны
// (например FormData), поэтому граница между ними — через unknown.
// Приводим к общей сигнатуре Fetch, которой пользуется TBankProvider.
export const tbankFetch: Fetch = (input, init) =>
  undiciFetch(input, { ...init, dispatcher: getDispatcher() } as unknown as Parameters<
    typeof undiciFetch
  >[1]) as unknown as Promise<Response>
