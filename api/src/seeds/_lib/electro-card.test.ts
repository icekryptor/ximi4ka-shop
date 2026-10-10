import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Block } from '@ximi4ka-shop/shared'
import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import {
  applyElectroCard,
  buildElectroBlocks,
  ELECTRO_COMPOSITION,
  ELECTRO_EQUIPMENT,
  ELECTRO_PRINTED,
  ELECTRO_REAGENTS_COUNT,
  ELECTRO_SLUG,
  mergeElectroDescription,
} from './electro-card.js'

const html = (blocks: Block[]) => blocks.flatMap((b) => (b.type === 'paragraph' ? [b.html] : []))

describe('данные карточки «Электрохимичка»', () => {
  it('13 реактивов: 6 растворов и 7 сухих; 16 предметов оборудования и 2 печатных', () => {
    expect(ELECTRO_REAGENTS_COUNT).toBe(13)
    expect(ELECTRO_COMPOSITION.map((g) => g.items.length)).toEqual([6, 7])
    expect(ELECTRO_EQUIPMENT).toHaveLength(16)
    expect(ELECTRO_PRINTED).toHaveLength(2)
  })

  it('блоки проходят isBlock; «Состав» и «Характеристики» — в формате витрины', () => {
    const blocks = buildElectroBlocks()
    expect(blocks.every(isBlock)).toBe(true)
    const [contents, chars] = html(blocks)
    expect(contents).toMatch(/^<h3>Состав<\/h3>/)
    expect((contents!.match(/<li>/g) ?? []).length).toBe(13 + 16 + 2)
    expect(chars).toMatch(/^<h3>Характеристики<\/h3>/)
    expect(chars).toContain('<li><strong>Размер коробки:</strong> 39 × 20 × 7 см</li>')
    expect(chars).toContain('<li><strong>Вес:</strong> 1 кг</li>')
    expect(chars).toContain('<li><strong>Реактивов в наборе:</strong> 13</li>')
  })

  it('концентрации и объёмы совпадают со списком владельца', () => {
    const contents = html(buildElectroBlocks())[0]!
    for (const s of [
      'гидроксида натрия 10%, 65 мл',
      'серной кислоты 10%, 65 мл',
      'иодида калия 5%, 35 мл',
      'дихромата калия 3%, 35 мл',
      'хлорида железа (III) 7%, 35 мл',
      'гидросульфата натрия 7%, 35 мл',
      'сера кристаллическая, 10 г',
      'иодат калия в порошке, 3 г',
      'медная проволока, 2 г',
    ]) {
      expect(contents).toContain(s)
    }
  })

  it('формулы получают индексы', () => {
    const contents = html(buildElectroBlocks())[0]!
    expect(contents).toContain('K<sub>2</sub>Cr<sub>2</sub>O<sub>7</sub>')
    expect(contents).toContain('NaHSO<sub>4</sub>')
    expect(contents).toContain('<strong>Zn</strong>')
  })
})

describe('mergeElectroDescription', () => {
  const intro: Block = { type: 'paragraph', html: '<p>Вводный текст</p>' }

  it('сохраняет прежние блоки и дописывает состав с характеристиками в конец', () => {
    const merged = mergeElectroDescription([intro])
    expect(merged[0]).toEqual(intro)
    expect(merged).toHaveLength(3)
  })

  it('заменяет прежние «Состав»/«Характеристики», а не дублирует', () => {
    const old: Block[] = [
      intro,
      { type: 'paragraph', html: '<h3>Состав</h3><ul><li>старое</li></ul>' },
      {
        type: 'paragraph',
        html: '<h3>Характеристики</h3><ul><li><strong>Вес:</strong> 9 кг</li></ul>',
      },
    ]
    const merged = mergeElectroDescription(old)
    expect(merged).toHaveLength(3)
    expect(JSON.stringify(merged)).not.toContain('старое')
    expect(JSON.stringify(merged)).not.toContain('9 кг')
  })

  it('идемпотентна', () => {
    const once = mergeElectroDescription([intro])
    expect(mergeElectroDescription(once)).toEqual(once)
  })
})

describe('applyElectroCard на настоящем Postgres', () => {
  const intro: Block = { type: 'paragraph', html: '<p>Вводный текст</p>' }

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE TABLE "products" RESTART IDENTITY CASCADE')
  })

  const seedCard = () =>
    AppDataSource.getRepository(Product).save({
      slug: ELECTRO_SLUG,
      name: 'Электрохимичка',
      priceRub: 3099,
      shortDescription: 'Набор для продвинутых химиков',
      longDescriptionBlocks: [intro],
    })
  const readCard = () =>
    AppDataSource.getRepository(Product).findOneOrFail({ where: { slug: ELECTRO_SLUG } })

  it('дописывает состав, не трогая остальные поля; возвращает старое описание для отката', async () => {
    await seedCard()
    const report = await applyElectroCard(AppDataSource)
    expect(report.before.longDescriptionBlocks).toEqual([intro])

    const card = await readCard()
    expect(card.longDescriptionBlocks).toEqual(mergeElectroDescription([intro]))
    expect(card.name).toBe('Электрохимичка')
    expect(card.priceRub).toBe(3099)
    expect(card.shortDescription).toBe('Набор для продвинутых химиков')
  })

  it('идемпотентен: повторный запуск не плодит блоки', async () => {
    await seedCard()
    await applyElectroCard(AppDataSource)
    await applyElectroCard(AppDataSource)
    expect((await readCard()).longDescriptionBlocks).toHaveLength(3)
  })

  it('dry-run ничего не пишет', async () => {
    await seedCard()
    const report = await applyElectroCard(AppDataSource, { dryRun: true })
    expect(report.dryRun).toBe(true)
    expect((await readCard()).longDescriptionBlocks).toEqual([intro])
  })

  it('без товара в БД падает с понятной ошибкой', async () => {
    await expect(applyElectroCard(AppDataSource)).rejects.toThrow(ELECTRO_SLUG)
  })
})
