// Доставка в Беларусь, Казахстан, Армению и Киргизию: город выбирается из списка
// городов с ПВЗ СДЭК, адрес пункта покупатель пишет сам, отправку оформляет
// оператор вручную. Цены и список городов — единый источник для api и web.
export const CIS_COUNTRIES = ['BY', 'KZ', 'AM', 'KG'] as const
export type CisCountry = (typeof CIS_COUNTRIES)[number]

export const CIS_COUNTRY_NAMES: Record<CisCountry, string> = {
  BY: 'Беларусь',
  KZ: 'Казахстан',
  AM: 'Армения',
  KG: 'Киргизия',
}

// Код флага для <Flag> (web/components/marketing/Flag.tsx).
export const CIS_FLAG_CODES = { BY: 'by', KZ: 'kz', AM: 'am', KG: 'kg' } as const satisfies Record<
  CisCountry,
  string
>

// Условия от владельца, 17.10.2026. Порог — по сумме товаров за вычетом скидки.
export const CIS_DELIVERY_RULES: Record<CisCountry, { freeFromRub: number; priceRub: number }> = {
  BY: { freeFromRub: 3000, priceRub: 700 },
  KZ: { freeFromRub: 5000, priceRub: 900 },
  KG: { freeFromRub: 5000, priceRub: 900 },
  AM: { freeFromRub: 5000, priceRub: 1200 },
}

export function cisShippingRub(country: CisCountry, amountRub: number): number {
  const rule = CIS_DELIVERY_RULES[country]
  return amountRub >= rule.freeFromRub ? 0 : rule.priceRub
}

// Города, где у СДЭК есть пункты выдачи или постаматы. Снимок боевого API СДЭК
// (GET /v2/deliverypoints?country_code=…) на 17.10.2026; порядок — по числу точек,
// затем по алфавиту. Названия очищены от района и области. Обновлять вручную.
export const CIS_CITIES: Record<CisCountry, string[]> = {
  BY: [
    'Минск',
    'Гомель',
    'Гродно',
    'Брест',
    'Витебск',
    'Могилёв',
    'Барановичи',
    'Бобруйск',
    'Мозырь',
    'Пинск',
    'Берёза',
    'Борисов',
    'Волковыск',
    'Глубокое',
    'Жлобин',
    'Жодино',
    'Кобрин',
    'Лесной',
    'Лида',
    'Молодечно',
    'Новолукомль',
    'Новополоцк',
    'Орша',
    'Полоцк',
    'Речица',
    'Светлогорск',
    'Слоним',
    'Смолевичи',
    'Сморгонь',
    'Солигорск',
    'Фаниполь',
  ],
  KZ: [
    'Алматы',
    'Астана',
    'Караганда',
    'Актобе',
    'Петропавловск',
    'Актау',
    'Уральск',
    'Усть-Каменогорск',
    'Шымкент',
    'Кокшетау',
    'Костанай',
    'Атырау',
    'Тараз',
    'Павлодар',
    'Каскелен',
    'Семей',
    'Темиртау',
    'Атбасар',
    'Балхаш',
    'Бесагаш',
    'Боралдай',
    'Есик',
    'Жанаозен',
    'Жезказган',
    'Конаев',
    'Кордай',
    'Кызылорда',
    'Ленгер',
    'Лисаковск',
    'Новоишимское',
    'Отеген-Батыр',
    'Приозёрск',
    'Риддер',
    'Рудный',
    'Сарань',
    'Сатпаев',
    'Степногорск',
    'Тайынша',
    'Талгар',
    'Талдыкорган',
    'Тобыл',
    'Туздыбастау',
    'Туркестан',
    'Шахтинск',
    'Щучинск',
    'Экибастуз',
  ],
  KG: [
    'Бишкек',
    'Балыкчи',
    'Джалал-Абад',
    'Кант',
    'Кара-Балта',
    'Кара-Суу',
    'Каракол',
    'Ош',
    'Сокулук',
    'Талас',
    'Токмок',
    'Чолпон-Ата',
  ],
  AM: ['Ереван', 'Абовян', 'Вагаршапат (Эчмиадзин)', 'Гюмри', 'Дилижан'],
}

export function isCisCity(country: CisCountry, city: string): boolean {
  return CIS_CITIES[country].includes(city)
}

// Личный номер получателя для таможни: без ИИН (Казахстан) или ПИН (Киргизия) посылку
// не выпустят. Беларуси и Армении номер не нужен — поле там не показываем.
export const CIS_TAX_ID: Partial<
  Record<CisCountry, { label: string; length: number; hint: string }>
> = {
  KZ: {
    label: 'ИИН',
    length: 12,
    hint: '12 цифр, есть в удостоверении личности. Без него посылку не пропустит таможня',
  },
  KG: {
    label: 'ПИН',
    length: 14,
    hint: 'Персональный номер, 14 цифр, есть в паспорте. Без него посылку не пропустит таможня',
  },
}

export function normalizeTaxId(value: string): string {
  return value.replace(/[\s-]/g, '')
}

// Контрольная цифра ИИН Казахстана: веса 1…11, остаток от 11; если вышло 10 — веса
// 3…11, 1, 2; снова 10 — такой номер не выдаётся.
function isKzIinChecksumValid(iin: string): boolean {
  const digits = Array.from(iin, Number)
  const mod = (weights: number[]) => weights.reduce((sum, w, i) => sum + w * digits[i]!, 0) % 11
  let control = mod([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  if (control === 10) control = mod([3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2])
  return control !== 10 && control === digits[11]
}

/** Ошибка в ИИН/ПИН для страны или null, если номер не нужен или верен. */
export function cisTaxIdError(country: CisCountry, value: string): string | null {
  const rule = CIS_TAX_ID[country]
  if (!rule) return null
  const id = normalizeTaxId(value)
  if (id === '') return `Укажите ${rule.label} — без него посылку не пропустит таможня`
  if (!/^\d+$/.test(id) || id.length !== rule.length) return `${rule.label} — ${rule.length} цифр`
  if (country === 'KZ' && !isKzIinChecksumValid(id)) {
    return 'Проверьте ИИН — в номере опечатка'
  }
  return null
}

// Куда везём: способ «cdek_manual_cis» — страна, город из списка и адрес ПВЗ;
// для Казахстана и Киргизии ещё ИИН/ПИН получателя (CIS_TAX_ID).
export interface CisDeliveryDestination {
  method: 'cdek_manual_cis'
  country: CisCountry
  city: string
  address: string
  taxId?: string
}
