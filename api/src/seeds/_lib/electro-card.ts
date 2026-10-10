// Карточка «Электрохимичка» (slug elektrohimichka): состав и характеристики.
// Данные — из списка, присланного владельцем (10.10.2026). Фото, цена, SEO-поля
// и вводный текст не трогаем: в карточке меняются только блоки «Состав» и
// «Характеристики» в longDescriptionBlocks.
import type { DataSource } from 'typeorm'
import type { Block } from '@ximi4ka-shop/shared'
import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
import { Product } from '../../entities/Product.js'
import { characteristicsBlock, compositionBlock, type ReagentGroup } from './card-html.js'

export const ELECTRO_SLUG = 'elektrohimichka'

export const ELECTRO_COMPOSITION: ReagentGroup[] = [
  {
    title: 'Растворы',
    items: [
      { formula: 'NaOH', name: 'раствор гидроксида натрия 10%, 65 мл' },
      { formula: 'H2SO4', name: 'раствор серной кислоты 10%, 65 мл' },
      { formula: 'KI', name: 'раствор иодида калия 5%, 35 мл' },
      { formula: 'K2Cr2O7', name: 'раствор дихромата калия 3%, 35 мл' },
      { formula: 'FeCl3', name: 'раствор хлорида железа (III) 7%, 35 мл' },
      { formula: 'NaHSO4', name: 'раствор гидросульфата натрия 7%, 35 мл' },
    ],
  },
  {
    title: 'Сухие реактивы и металлы',
    items: [
      { formula: 'S', name: 'сера кристаллическая, 10 г' },
      { formula: 'KIO3', name: 'иодат калия в порошке, 3 г' },
      { formula: 'SnCl2', name: 'хлорид олова (II) в порошке, 3 г' },
      { formula: 'Mg', name: 'магниевая стружка, 3 г' },
      { formula: 'Cu', name: 'медная проволока, 2 г' },
      { formula: 'Fe', name: 'железная вата, 3 г' },
      { formula: 'Zn', name: 'цинк в гранулах, 3 г' },
    ],
  },
]

export const ELECTRO_EQUIPMENT: string[] = [
  'пробирка химическая, 6 шт.',
  'пипетка Пастера, 3 шт.',
  'штатив для пробирок, 1 шт.',
  'держатель для пробирок металлический, 1 шт.',
  'ёршик для чистки пробирок, 1 шт.',
  'чашка Петри, 2 шт.',
  'мерный стаканчик, 1 шт.',
  'батарейки типа АА, 3 шт.',
  'блок питания, 1 шт.',
  'провода с крокодилами, 1 шт.',
  'светодиод, 1 шт.',
  'графитовые стержни, 1 пенал',
  'мерная ложечка-шпатель силиконовая, 1 шт.',
  'наперсток, 1 шт.',
  'перчатки нитриловые М, 1 пара',
  'защитные очки, 1 шт.',
]

export const ELECTRO_PRINTED: string[] = [
  'Электрометодичка, 1 шт.',
  'информационная листовка, 1 шт.',
]

export const ELECTRO_REAGENTS_COUNT = ELECTRO_COMPOSITION.reduce((n, g) => n + g.items.length, 0)

// Стоят в начале блока: по ним же идемпотентно вырезаем прежние версии.
const isHeadedParagraph = (b: unknown, heading: string): boolean =>
  isBlock(b) &&
  b.type === 'paragraph' &&
  new RegExp(`^<h3[^>]*>\\s*${heading}\\s*</h3>`, 'i').test(b.html)

export function buildElectroBlocks(): Block[] {
  return [
    compositionBlock(ELECTRO_COMPOSITION, [
      { title: 'Оборудование', items: ELECTRO_EQUIPMENT },
      { title: 'Печатная продукция', items: ELECTRO_PRINTED },
    ]),
    characteristicsBlock([
      ['Реактивов в наборе', String(ELECTRO_REAGENTS_COUNT)],
      ['Пробирки', '6 шт.'],
      ['Размер коробки', '39 × 20 × 7 см'],
      ['Вес', '1 кг'],
    ]),
  ]
}

// Прежние блоки без «Состав»/«Характеристики» + свежие в конце. Чужие записи
// в описании (не Block) не отбрасываем.
export function mergeElectroDescription(existing: unknown[]): Block[] {
  // Колонка jsonb типизирована как unknown[]; cast — только ради сигнатуры update.
  const kept = existing.filter(
    (b) => !isHeadedParagraph(b, 'Состав') && !isHeadedParagraph(b, 'Характеристики'),
  ) as Block[]
  return [...kept, ...buildElectroBlocks()]
}

export interface ElectroCardReport {
  productId: string
  dryRun: boolean
  // Значение до замены — сохраните вывод: по нему делается откат.
  before: { longDescriptionBlocks: unknown[] }
}

// Идемпотентно: повторный запуск даёт то же состояние.
export async function applyElectroCard(
  dataSource: DataSource,
  options: { dryRun?: boolean } = {},
): Promise<ElectroCardReport> {
  const dryRun = options.dryRun === true
  return dataSource.transaction(async (em) => {
    const product = await em.findOne(Product, { where: { slug: ELECTRO_SLUG } })
    if (!product) throw new Error(`Товар ${ELECTRO_SLUG} не найден в БД`)

    const report: ElectroCardReport = {
      productId: product.id,
      dryRun,
      before: { longDescriptionBlocks: product.longDescriptionBlocks },
    }
    if (dryRun) return report

    await em.update(Product, product.id, {
      longDescriptionBlocks: mergeElectroDescription(product.longDescriptionBlocks),
    })
    return report
  })
}
