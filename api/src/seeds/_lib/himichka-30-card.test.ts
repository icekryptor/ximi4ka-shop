import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import {
  applyHimichka30Composition,
  characteristicsBlock,
  compositionBlock,
  HIMICHKA_30_COMPOSITION,
  HIMICHKA_30_EQUIPMENT,
  HIMICHKA_30_PRINTED,
  HIMICHKA_30_REAGENTS_COUNT,
  HIMICHKA_30_SLUG,
  withComposition,
} from './himichka-30-card.js'

const html = (b: unknown) => (b as { html: string }).html

describe('данные карточки «Химичка 3.0»', () => {
  it('17 реактивов и 1 индикатор — 18 позиций состава', () => {
    expect(HIMICHKA_30_REAGENTS_COUNT).toBe(17)
    const all = HIMICHKA_30_COMPOSITION.reduce((n, g) => n + g.items.length, 0)
    expect(all).toBe(18)
    expect(HIMICHKA_30_EQUIPMENT).toHaveLength(8)
    expect(HIMICHKA_30_PRINTED).toHaveLength(3)
  })

  it('«Состав» в формате, который читает витрина, и содержит все позиции', () => {
    const block = compositionBlock()
    expect(isBlock(block)).toBe(true)
    expect(html(block)).toMatch(/<h3[^>]*>\s*Состав\s*<\/h3>/i)
    expect((html(block).match(/<li>/g) ?? []).length).toBe(18 + 8 + 3)
  })

  it('формулы получают индексы', () => {
    const c = html(compositionBlock())
    expect(c).toContain('K<sub>2</sub>Cr<sub>2</sub>O<sub>7</sub>')
    expect(c).toContain('(NH<sub>4</sub>)<sub>2</sub>CO<sub>3</sub>')
    expect(c).toContain('Ni(NO<sub>3</sub>)<sub>2</sub>')
    expect(c).toContain('Na<sub>2</sub>SO<sub>3</sub>')
  })

  it('«Характеристики» парсятся как <li><strong>Ключ:</strong> Значение</li>', () => {
    const c = html(characteristicsBlock())
    expect(c).toMatch(/<li><strong>Реактивов в наборе:<\/strong> 17<\/li>/)
    expect(c).toContain('40 × 24 × 7 см')
    expect(c).toMatch(/<li><strong>Вес:<\/strong> 1 кг<\/li>/)
  })
})

describe('withComposition', () => {
  const intro = { type: 'paragraph', html: '<p>Описание</p>' }

  it('сохраняет прежние блоки и дописывает состав и характеристики в конец', () => {
    const out = withComposition([intro])
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual(intro)
    expect(html(out[1])).toContain('<h3>Состав</h3>')
    expect(html(out[2])).toContain('<h3>Характеристики</h3>')
  })

  it('идемпотентна: повторный вызов заменяет, а не дублирует', () => {
    const once = withComposition([intro])
    expect(withComposition(once)).toEqual(once)
  })
})

describe('applyHimichka30Composition на настоящем Postgres', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE TABLE "products" RESTART IDENTITY CASCADE')
  })

  const intro = { type: 'paragraph', html: '<p>Описание</p>' }

  async function seedCard() {
    return AppDataSource.getRepository(Product).save({
      slug: HIMICHKA_30_SLUG,
      name: 'Химичка 3.0',
      priceRub: 3299,
      shortDescription: 'коротко',
      longDescriptionBlocks: [intro],
    })
  }

  const readCard = () =>
    AppDataSource.getRepository(Product).findOneOrFail({ where: { slug: HIMICHKA_30_SLUG } })

  it('добавляет блоки, не трогая остальное; возвращает старые значения для отката', async () => {
    await seedCard()
    const report = await applyHimichka30Composition(AppDataSource)
    expect(report.before.longDescriptionBlocks).toEqual([intro])

    const card = await readCard()
    expect(card.longDescriptionBlocks).toEqual(withComposition([intro]))
    expect(card.name).toBe('Химичка 3.0')
    expect(card.priceRub).toBe(3299)
    expect(card.shortDescription).toBe('коротко')
  })

  it('идемпотентен', async () => {
    await seedCard()
    await applyHimichka30Composition(AppDataSource)
    await applyHimichka30Composition(AppDataSource)
    expect((await readCard()).longDescriptionBlocks).toHaveLength(3)
  })

  it('dry-run ничего не пишет', async () => {
    await seedCard()
    const report = await applyHimichka30Composition(AppDataSource, { dryRun: true })
    expect(report.dryRun).toBe(true)
    expect((await readCard()).longDescriptionBlocks).toEqual([intro])
  })

  it('без товара в БД падает с понятной ошибкой', async () => {
    await expect(applyHimichka30Composition(AppDataSource)).rejects.toThrow(HIMICHKA_30_SLUG)
  })
})
