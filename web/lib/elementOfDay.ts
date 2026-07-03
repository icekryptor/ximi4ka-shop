// «Элемент дня» — интерактивная пасхалка в футере (v3.5, см.
// V3_5_BRIGHT_ADDENDUM §5.5). Детерминированный выбор элемента таблицы
// Менделеева по дате: день года по модулю длины списка, так что элемент
// меняется раз в сутки и одинаков для всех посетителей.

export interface ElementOfDay {
  number: number
  symbol: string
  name: string
  fact: string
}

// Подборка элементов с короткими фактами — химия набора «Химичка» + классика
// школьной программы. Порядок не обязан совпадать с атомными номерами.
export const ELEMENTS: ElementOfDay[] = [
  { number: 1, symbol: 'H', name: 'Водород', fact: 'самый лёгкий: 90% атомов Вселенной' },
  { number: 6, symbol: 'C', name: 'Углерод', fact: 'основа всей органики — и грифеля' },
  { number: 7, symbol: 'N', name: 'Азот', fact: '78% воздуха, которым вы дышите' },
  { number: 8, symbol: 'O', name: 'Кислород', fact: 'поддерживает горение и жизнь' },
  { number: 11, symbol: 'Na', name: 'Натрий', fact: 'взрывается в воде, живёт в соли' },
  { number: 13, symbol: 'Al', name: 'Алюминий', fact: 'когда-то дороже золота' },
  { number: 16, symbol: 'S', name: 'Сера', fact: 'жёлтые кристаллы и запах спичек' },
  { number: 19, symbol: 'K', name: 'Калий', fact: 'горит фиолетовым пламенем' },
  { number: 20, symbol: 'Ca', name: 'Кальций', fact: 'мел, мрамор и ваши кости' },
  { number: 26, symbol: 'Fe', name: 'Железо', fact: 'ядро Земли — почти целиком из него' },
  { number: 29, symbol: 'Cu', name: 'Медь', fact: 'звезда реакций Химички 3.0' },
  { number: 30, symbol: 'Zn', name: 'Цинк', fact: 'анод в вашей первой батарейке' },
  { number: 47, symbol: 'Ag', name: 'Серебро', fact: 'лучший проводник среди металлов' },
  { number: 53, symbol: 'I', name: 'Иод', fact: 'возгоняется фиолетовым паром' },
  { number: 79, symbol: 'Au', name: 'Золото', fact: 'не окисляется тысячелетиями' },
]

/** Номер дня в году (1–366) в локальном времени. */
export function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  return Math.floor(diff / 86_400_000)
}

/** Детерминированный «элемент дня» для даты. */
export function getElementOfDay(date: Date = new Date()): ElementOfDay {
  return ELEMENTS[dayOfYear(date) % ELEMENTS.length]
}
