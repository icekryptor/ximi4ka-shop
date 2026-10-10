// Карточка «Химичка 3.0» (slug himichka-30): состав и характеристики набора.
// Данные — из списка состава, присланного владельцем.
//
// В отличие от oge-card, фото и тексты карточки не трогаем: добавляем только блоки
// «Состав» и «Характеристики» в longDescriptionBlocks — их читает витрина
// (вкладка «Состав», секция «Что внутри», таблица характеристик).
import type { DataSource } from 'typeorm'
import type { Block } from '@ximi4ka-shop/shared'
import { Product } from '../../entities/Product.js'
import {
  characteristicsBlock as renderCharacteristics,
  compositionBlock as renderComposition,
  type ReagentGroup,
} from './card-html.js'

export const HIMICHKA_30_SLUG = 'himichka-30'

export const HIMICHKA_30_COMPOSITION: ReagentGroup[] = [
  {
    title: 'Кислота и щёлочь, по 65 мл',
    items: [
      { formula: 'H2SO4', name: 'раствор серной кислоты 10%' },
      { formula: 'NaOH', name: 'раствор гидроксида натрия 10%' },
    ],
  },
  {
    title: 'Растворы, по 35 мл',
    items: [
      { formula: 'AgNO3', name: 'раствор нитрата серебра 1%' },
      { formula: 'Al2(SO4)3', name: 'раствор сульфата алюминия 7%' },
      { formula: 'BaCl2', name: 'раствор хлорида бария 3%' },
      { formula: 'K2Cr2O7', name: 'раствор дихромата калия 3%' },
      { formula: 'KMnO4', name: 'раствор перманганата калия 1%' },
      { formula: 'CoSO4', name: 'раствор сульфата кобальта 5%' },
      { formula: 'Ni(NO3)2', name: 'раствор нитрата никеля 5%' },
      { formula: 'CuSO4', name: 'раствор сульфата меди 6%' },
      { formula: 'FeSO4', name: 'раствор сульфата железа (II) 7%' },
      { formula: '(NH4)2CO3', name: 'раствор карбоната аммония 7%' },
      { formula: 'KI', name: 'раствор иодида калия 5%' },
      { formula: 'K3PO4', name: 'раствор фосфата калия 7%' },
    ],
  },
  {
    title: 'Сухие реактивы, по 4 г',
    items: [
      { formula: 'Zn', name: 'цинк в гранулах' },
      { formula: 'Fe', name: 'железо в порошке' },
      { formula: 'Na2SO3', name: 'сульфит натрия в порошке' },
    ],
  },
  {
    title: 'Индикатор',
    indicator: true,
    items: [{ formula: '', name: 'фенолфталеин, 1%, 20 мл' }],
  },
]

export const HIMICHKA_30_EQUIPMENT: string[] = [
  'пробирки химические, 6 шт.',
  'штатив для пробирок на 6 гнёзд, 1 шт.',
  'портативный разогреватель, 1 шт.',
  'ёршик для чистки пробирок, 1 шт.',
  'мерная ложечка-шпатель, 1 шт.',
  'пипетка Пастера, 3 шт.',
  'металлический зажим для пробирок, 1 шт.',
  'перчатки нитриловые, размер M, 1 пара',
  'свеча, 1 шт.',
]

export const HIMICHKA_30_PRINTED: string[] = [
  'таблица Менделеева и таблица растворимости, 1 шт.',
  'Химичка-методичка, 1 шт.',
  'информационная листовка, 1 шт.',
]

export const HIMICHKA_30_REAGENTS_COUNT = HIMICHKA_30_COMPOSITION.filter(
  (g) => !g.indicator,
).reduce((n, g) => n + g.items.length, 0)

const COMPOSITION_HEADING_RE = /<h3[^>]*>\s*Состав\s*<\/h3>/i
const CHARACTERISTICS_HEADING_RE = /<h3[^>]*>\s*Характеристики\s*<\/h3>/i

export function compositionBlock(): Block {
  return renderComposition(HIMICHKA_30_COMPOSITION, [
    { title: 'Оборудование', items: HIMICHKA_30_EQUIPMENT },
    { title: 'Печатная продукция', items: HIMICHKA_30_PRINTED },
  ])
}

export function characteristicsBlock(): Block {
  return renderCharacteristics([
    ['Реактивов в наборе', String(HIMICHKA_30_REAGENTS_COUNT)],
    ['Индикаторов', '1 (фенолфталеин)'],
    ['Пробирки', '6 шт.'],
    ['Размер упаковки', '40 × 24 × 7 см'],
    ['Вес', '1 кг'],
  ])
}

const htmlOf = (b: unknown): string => (b as { html?: string } | null)?.html ?? ''

// Оставляет все блоки, кроме прежних «Состав» и «Характеристики», и дописывает
// свежие в конец. Идемпотентно.
export function withComposition(existing: unknown[]): unknown[] {
  const kept = existing.filter((b) => {
    const html = htmlOf(b)
    return !COMPOSITION_HEADING_RE.test(html) && !CHARACTERISTICS_HEADING_RE.test(html)
  })
  return [...kept, compositionBlock(), characteristicsBlock()]
}

export interface Himichka30Report {
  productId: string
  dryRun: boolean
  // Значения до замены — сохраните вывод: по нему делается откат.
  before: { longDescriptionBlocks: unknown[] }
}

// Одна транзакция; фото, цена и остальные тексты не меняются.
export async function applyHimichka30Composition(
  dataSource: DataSource,
  options: { dryRun?: boolean } = {},
): Promise<Himichka30Report> {
  const dryRun = options.dryRun === true
  return dataSource.transaction(async (em) => {
    const product = await em.findOne(Product, { where: { slug: HIMICHKA_30_SLUG } })
    if (!product) throw new Error(`Товар ${HIMICHKA_30_SLUG} не найден в БД`)

    const before = Array.isArray(product.longDescriptionBlocks) ? product.longDescriptionBlocks : []
    const report: Himichka30Report = {
      productId: product.id,
      dryRun,
      before: { longDescriptionBlocks: before },
    }
    if (dryRun) return report

    await em.update(Product, product.id, {
      longDescriptionBlocks: withComposition(before) as Block[],
    })
    return report
  })
}
