import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SHIPPING_RULES } from '@/lib/checkout'
import {
  CDEK_TERMS,
  ORDER_PROCESS_PATH,
  ORDER_STEPS,
  SCREEN_SIZE,
  buildDeliveryZones,
  orderProcessPath,
} from './orderProcess'

const publicFile = (path: string) => resolve(__dirname, `../public${path}`)

describe('buildDeliveryZones', () => {
  const pvz = SHIPPING_RULES.cdek_pvz.freeFromRub
  const courier = SHIPPING_RULES.cdek_courier.freeFromRub

  afterEach(() => {
    SHIPPING_RULES.cdek_pvz.freeFromRub = pvz
    SHIPPING_RULES.cdek_courier.freeFromRub = courier
  })

  it('отдаёт четыре зоны в порядке РФ, Беларусь, ЕАЭС, СНГ', () => {
    expect(buildDeliveryZones().map((z) => z.id)).toEqual(['ru', 'by', 'eaeu', 'cis'])
  })

  it('содержит ровно страны из спеки, Молдовы нет', () => {
    const names = buildDeliveryZones().flatMap((z) => z.countries.map((c) => c.name))
    expect(names).toEqual([
      'Россия',
      'Беларусь',
      'Казахстан',
      'Армения',
      'Киргизия',
      'Узбекистан',
      'Азербайджан',
      'Таджикистан',
    ])
    expect(names).not.toContain('Молдова')
  })

  it('сопоставляет страны с кодами флагов', () => {
    const codes = buildDeliveryZones().flatMap((z) => z.countries.map((c) => c.code))
    expect(codes).toEqual(['ru', 'by', 'kz', 'am', 'kg', 'uz', 'az', 'tj'])
  })

  it('пишет пороги: РФ 3000/5000, Беларусь 3000, ЕАЭС 5000, СНГ отдельно', () => {
    const [ru, by, eaeu, cis] = buildDeliveryZones()
    expect(ru.condition).toMatch(/от 3\D000\D*₽ до пункта выдачи, курьером — от 5\D000\D*₽/u)
    expect(by.condition).toMatch(/^Бесплатно от 3\D000\D*₽, иначе 700\D*₽$/u)
    expect(eaeu.condition).toMatch(
      /^Бесплатно от 5\D000\D*₽, иначе 900\D*₽ \(Казахстан, Киргизия\), 1\D200\D*₽ \(Армения\)$/u,
    )
    expect(cis.condition).toBe('Доставка оплачивается отдельно')
  })

  it('порог РФ следует за SHIPPING_RULES без правки текста', () => {
    SHIPPING_RULES.cdek_pvz.freeFromRub = 3500
    SHIPPING_RULES.cdek_courier.freeFromRub = 6000
    const [ru] = buildDeliveryZones()
    expect(ru.condition).toMatch(/от 3\D500\D*₽ до пункта выдачи, курьером — от 6\D000\D*₽/u)
  })
})

describe('CDEK_TERMS', () => {
  it('содержит три региона со сроками из спеки', () => {
    expect(CDEK_TERMS).toEqual([
      { region: 'Москва и Московская область, Ленинградская область', days: '2–3 дня' },
      { region: 'Европейская часть России, Кавказ', days: '3–5 дней' },
      { region: 'Сибирь, Забайкалье, Дальний Восток', days: '7–10 дней' },
    ])
  })
})

describe('ORDER_STEPS', () => {
  it('шаг 1 объясняет выбор региона и города в чекауте', () => {
    expect(ORDER_STEPS[0]!.details.join(' ')).toMatch(/выберите страну и город из списка/u)
  })

  it('шаг 1 предупреждает, что для этих стран оплата пока только картами «Мир»', () => {
    expect(ORDER_STEPS[0]!.details.join(' ')).toMatch(
      /оплата для этих стран доступна только картами «Мир»/u,
    )
  })

  it('содержит четыре шага с номерами 1–4 и непустыми текстами', () => {
    expect(ORDER_STEPS.map((s) => s.index)).toEqual([1, 2, 3, 4])
    for (const s of ORDER_STEPS) {
      expect(s.title).not.toBe('')
      expect(s.summary).not.toBe('')
      expect(s.details.length).toBeGreaterThan(0)
    }
  })

  it('шаг 3 говорит про отправку в течение суток', () => {
    expect(ORDER_STEPS[2].summary).toMatch(/в течение суток/)
  })

  it('четыре скриншота: два у шага 1, два у шага 2', () => {
    expect(ORDER_STEPS.map((s) => s.screenshots.length)).toEqual([2, 2, 0, 0])
  })
})

describe('файлы на диске', () => {
  const flagCodes = buildDeliveryZones().flatMap((z) => z.countries.map((c) => c.code))

  it.each(flagCodes)('флаг %s есть и не содержит скриптов', (code) => {
    const file = publicFile(`/img/flags/${code}.svg`)
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file, 'utf8')).not.toMatch(/<script|\son[a-z]+=/i)
  })

  const shots = ORDER_STEPS.flatMap((s) => s.screenshots)

  it.each(shots)('скриншот $src есть на диске', (shot) => {
    expect(existsSync(publicFile(shot.src))).toBe(true)
  })

  it.each(shots)('у скриншота $src есть alt, подпись и размер 1200×750', (shot) => {
    expect(shot.alt.length).toBeGreaterThan(20)
    expect(shot.caption).not.toBe('')
    expect({ width: shot.width, height: shot.height }).toEqual(SCREEN_SIZE)
  })
})

describe('orderProcessPath', () => {
  it('для русской локали без префикса, для английской с префиксом', () => {
    expect(ORDER_PROCESS_PATH).toBe('/order-process')
    expect(orderProcessPath('ru')).toBe('/order-process')
    expect(orderProcessPath('en')).toBe('/en/order-process')
  })
})
