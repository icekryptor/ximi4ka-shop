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

// Куда везём: способ «cdek_manual_cis» — страна, город из списка и адрес ПВЗ.
export interface CisDeliveryDestination {
  method: 'cdek_manual_cis'
  country: CisCountry
  city: string
  address: string
}
