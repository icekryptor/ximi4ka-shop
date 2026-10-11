// Карточка «Мини-Химичка» (slug mini-himichka): блоки «Состав» и «Характеристики».
// Данные — из списка состава, присланного владельцем 10.10.2026.
//
// Это ДОПИСЫВАНИЕ, а не замена: остальное описание, фото и мета-поля не трогаются.
// Если у карточки уже есть блоки «Состав» или «Характеристики», они заменяются
// новыми, так что повторный запуск (в том числе с поправленными данными) не плодит дубли.
// Витрина берёт из этих блоков вкладки «Состав» и «Характеристики» (см.
// web/components/product/ContentsSection.tsx и web/lib/parseCharacteristics.ts).
import type { DataSource } from 'typeorm'
import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
import type { Block } from '@ximi4ka-shop/shared'
import { Product } from '../../entities/Product.js'
import { characteristicsBlock, compositionBlock, type ReagentGroup } from './card-html.js'

export const MINI_SLUG = 'mini-himichka'

export const MINI_COMPOSITION: ReagentGroup[] = [
  {
    title: 'Кислота и щёлочь',
    items: [
      { formula: 'H2SO4', name: 'серная кислота 10%, 65 мл' },
      { formula: 'NaOH', name: 'гидроксид натрия 10%, 65 мл' },
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
    title: 'Металлы и соль в порошке',
    items: [
      { formula: 'Zn', name: 'цинк в гранулах, 4 г' },
      { formula: 'Fe', name: 'железо в порошке, 4 г' },
      { formula: 'Na2SO3', name: 'сульфит натрия в порошке, 4 г' },
    ],
  },
  {
    title: 'Индикатор',
    indicator: true,
    items: [{ formula: '', name: 'индикатор фенолфталеин, 1%, 20 мл' }],
  },
]

export const MINI_EQUIPMENT: string[] = [
  'пробирки химические, 2 шт.',
  'мерная ложечка-шпатель, 1 шт.',
  'пипетка Пастера, 1 шт.',
]

export const MINI_PRINTED: string[] = [
  'информационная листовка, 1 шт.',
  'печатной методички в комплекте нет — только электронная версия',
]

export const MINI_REAGENTS_COUNT = MINI_COMPOSITION.filter((g) => !g.indicator).reduce(
  (n, g) => n + g.items.length,
  0,
)

const CONTENTS_RE = /<h3[^>]*>\s*Состав\s*<\/h3>/i
const CHARACTERISTICS_RE = /<h3[^>]*>\s*Характеристики\s*<\/h3>/i

export function buildMiniHimichkaBlocks(): Block[] {
  return [
    compositionBlock(MINI_COMPOSITION, [
      { title: 'Оборудование', items: MINI_EQUIPMENT },
      { title: 'Печатная продукция', items: MINI_PRINTED },
    ]),
    characteristicsBlock([
      ['Реактивов в наборе', String(MINI_REAGENTS_COUNT)],
      ['Индикаторов', '1 (фенолфталеин)'],
      ['Пробирки', '2 шт.'],
      ['Методичка', 'только электронная версия'],
      ['Размер упаковки', '17 × 15 × 12 см'],
      ['Вес', '1 кг'],
    ]),
  ]
}

function isContentsOrCharacteristics(block: unknown): boolean {
  if (!isBlock(block) || block.type !== 'paragraph') return false
  const html = (block as { html?: string }).html ?? ''
  return CONTENTS_RE.test(html) || CHARACTERISTICS_RE.test(html)
}

export interface MiniHimichkaReport {
  productId: string
  dryRun: boolean
  // Значения до записи — сохраните вывод: по нему делается откат.
  before: { longDescriptionBlocks: unknown[] }
}

// Идемпотентно: повторный запуск даёт то же состояние. Одна транзакция.
export async function applyMiniHimichkaCard(
  dataSource: DataSource,
  options: { dryRun?: boolean } = {},
): Promise<MiniHimichkaReport> {
  const dryRun = options.dryRun === true
  return dataSource.transaction(async (em) => {
    const product = await em.findOne(Product, { where: { slug: MINI_SLUG } })
    if (!product) throw new Error(`Товар ${MINI_SLUG} не найден в БД`)

    const current: unknown[] = Array.isArray(product.longDescriptionBlocks)
      ? product.longDescriptionBlocks
      : []
    const report: MiniHimichkaReport = {
      productId: product.id,
      dryRun,
      before: { longDescriptionBlocks: current },
    }
    if (dryRun) return report

    const next = [
      ...(current as Block[]).filter((b) => !isContentsOrCharacteristics(b)),
      ...buildMiniHimichkaBlocks(),
    ]
    await em.update(Product, product.id, { longDescriptionBlocks: next })
    return report
  })
}
