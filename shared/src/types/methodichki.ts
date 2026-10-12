// Электронные методички, которые покупатель получает после оплаты набора.
// Файлы лежат в web/public/methodichki/ и раздаются витриной по `url`.

export type MethodichkaKey = 'himichka' | 'elektrohimichka' | 'oge'

export interface Methodichka {
  key: MethodichkaKey
  title: string
  /** Путь на витрине, например `/methodichki/himichka.pdf`. */
  url: string
}

export const METHODICHKI: Record<MethodichkaKey, Methodichka> = {
  himichka: {
    key: 'himichka',
    title: 'Методичка «Химичка 3.0 / Мини-Химичка»',
    url: '/methodichki/himichka.pdf',
  },
  elektrohimichka: {
    key: 'elektrohimichka',
    title: 'Методичка «Электрохимичка»',
    url: '/methodichki/elektrohimichka.pdf',
  },
  oge: {
    key: 'oge',
    title: 'Методичка «Химичка ОГЭ»',
    url: '/methodichki/oge-2026.pdf',
  },
}

// Порядок ключей здесь же задаёт порядок ссылок на странице заказа.
const KEY_ORDER: MethodichkaKey[] = ['himichka', 'elektrohimichka', 'oge']

// slug товара → какие методички он даёт. Комбо раскрыты по составу наборов;
// «Все четыре набора» ещё нет в каталоге, ключ заведён заранее.
const BY_SLUG: Record<string, MethodichkaKey[]> = {
  'himichka-30': ['himichka'],
  'mini-himichka': ['himichka'],
  'himichka-metodichka': ['himichka'],
  elektrohimichka: ['elektrohimichka'],
  elektrometodichka: ['elektrohimichka'],
  'bolshoi-nabor-dlya-oge': ['oge'],
  'himichka-i-elektrohimichka': ['himichka', 'elektrohimichka'],
  'vse-tri-nabora': ['himichka', 'elektrohimichka'],
  'vse-chetyre-nabora': ['himichka', 'elektrohimichka', 'oge'],
}

/** Методички к купленным товарам: без повторов, в стабильном порядке. */
export function methodichkiForSlugs(slugs: readonly string[]): Methodichka[] {
  const got = new Set<MethodichkaKey>()
  for (const slug of slugs) for (const key of BY_SLUG[slug] ?? []) got.add(key)
  return KEY_ORDER.filter((k) => got.has(k)).map((k) => METHODICHKI[k])
}
