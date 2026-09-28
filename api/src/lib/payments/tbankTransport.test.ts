import fs from 'node:fs'
import tls from 'node:tls'
import { X509Certificate } from 'node:crypto'
import { describe, it, expect, vi, afterEach } from 'vitest'

// undici экспортирует `fetch` как неконфигурируемое свойство — vi.spyOn на
// живом модуле падает с "Cannot redefine property". Подменяем экспорт через
// vi.mock (поднимается наверх файла), Agent оставляем настоящим. vi.hoisted
// — иначе фабрика попытается использовать undiciFetchMock раньше его
// инициализации (см. tbank.test.ts / checkout.test.ts).
const undiciFetchMock = vi.hoisted(() => vi.fn(async () => new Response('{}', { status: 200 })))
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>()
  return { ...actual, fetch: undiciFetchMock }
})

describe('tbankTransport: российский корневой сертификат', () => {
  it('PEM загружается, парсится и совпадает по CN и отпечатку с TBANK_ROOT_CA_FINGERPRINT', async () => {
    const { TBANK_ROOT_CA_FINGERPRINT, getTbankCaList } = await import('./tbankTransport.js')
    const list = getTbankCaList()
    const pem = list[list.length - 1] as string
    const cert = new X509Certificate(pem)
    expect(cert.subject).toContain('CN=Russian Trusted Root CA')
    expect(cert.issuer).toContain('CN=Russian Trusted Root CA')
    expect(cert.fingerprint256).toBe(TBANK_ROOT_CA_FINGERPRINT)
  })

  it('список CA содержит все системные корни Node плюс сертификат Минцифры', async () => {
    const { getTbankCaList } = await import('./tbankTransport.js')
    const list = getTbankCaList()
    expect(list.length).toBe(tls.rootCertificates.length + 1)
    for (const root of tls.rootCertificates) {
      expect(list).toContain(root)
    }
    expect(list).not.toEqual(tls.rootCertificates)
  })
})

describe('tbankTransport: ленивое чтение PEM', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('не читает файл сертификата при импорте модуля — только при первом обращении к CA-списку', async () => {
    vi.resetModules()
    const readSpy = vi.spyOn(fs, 'readFileSync')
    try {
      // PAYMENT_PROVIDER=manual импортирует этот модуль транзитивно через
      // tbank.ts/payments/index.ts, но не должен трогать диск: отсутствующий
      // PEM не может ронять запуск API, если Т-Банк не используется.
      const mod = await import('./tbankTransport.js')
      expect(readSpy).not.toHaveBeenCalled()

      mod.getTbankCaList()
      expect(readSpy).toHaveBeenCalledTimes(1)

      // Повторный вызов — из кэша, файл не перечитывается.
      mod.getTbankCaList()
      expect(readSpy).toHaveBeenCalledTimes(1)
    } finally {
      readSpy.mockRestore()
    }
  })
})

describe('tbankFetch', () => {
  afterEach(() => {
    undiciFetchMock.mockClear()
  })

  it('делегирует в undici fetch с dispatcher, доверяющим корню Минцифры', async () => {
    const { Agent } = await import('undici')
    const { tbankFetch } = await import('./tbankTransport.js')
    const res = await tbankFetch('https://securepay.tinkoff.ru/v2/Init', { method: 'POST' })

    expect(res.status).toBe(200)
    expect(undiciFetchMock).toHaveBeenCalledTimes(1)
    const [input, init] = undiciFetchMock.mock.calls[0] as unknown as [
      string,
      { dispatcher?: unknown },
    ]
    expect(input).toBe('https://securepay.tinkoff.ru/v2/Init')
    expect(init?.dispatcher).toBeInstanceOf(Agent)
  })

  it('переиспользует один и тот же dispatcher между вызовами (создаётся лениво один раз)', async () => {
    const { tbankFetch } = await import('./tbankTransport.js')
    await tbankFetch('https://securepay.tinkoff.ru/v2/Init', { method: 'POST' })
    await tbankFetch('https://securepay.tinkoff.ru/v2/GetState', { method: 'POST' })

    const dispatcher1 = (
      undiciFetchMock.mock.calls[0] as unknown as [string, { dispatcher?: unknown }]
    )[1]?.dispatcher
    const dispatcher2 = (
      undiciFetchMock.mock.calls[1] as unknown as [string, { dispatcher?: unknown }]
    )[1]?.dispatcher
    expect(dispatcher1).toBe(dispatcher2)
  })
})
