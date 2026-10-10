import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { isBlock } from '@ximi4ka-shop/shared/types/blocks'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { ProductImage } from '../../entities/ProductImage.js'
import {
  applyMiniHimichkaCard,
  buildMiniHimichkaBlocks,
  MINI_COMPOSITION,
  MINI_REAGENTS_COUNT,
  MINI_SLUG,
} from './mini-himichka-card.js'

const CONTENTS_RE = /<h3[^>]*>\s*Состав\s*<\/h3>/i
const CHARACTERISTICS_RE = /<h3[^>]*>\s*Характеристики\s*<\/h3>/i

const htmlOf = (blocks: unknown[]) =>
  blocks.flatMap((b) => (isBlock(b) && b.type === 'paragraph' ? [b.html] : []))

describe('данные карточки «Мини-Химичка»', () => {
  it('17 реактивов (2 кислота/щёлочь, 12 растворов, 3 сухих) и фенолфталеин отдельно', () => {
    expect(MINI_REAGENTS_COUNT).toBe(17)
    const all = MINI_COMPOSITION.reduce((n, g) => n + g.items.length, 0)
    expect(all).toBe(18)
  })

  it('блоки проходят isBlock; «Состав» и «Характеристики» в формате, который читает витрина', () => {
    const blocks = buildMiniHimichkaBlocks()
    expect(blocks).toHaveLength(2)
    expect(blocks.every(isBlock)).toBe(true)
    const [contents, chars] = htmlOf(blocks)
    expect(contents).toMatch(CONTENTS_RE)
    expect(chars).toMatch(CHARACTERISTICS_RE)
    // 18 позиций состава + 3 предмета оборудования + 2 пункта печатной продукции.
    expect((contents.match(/<li>/g) ?? []).length).toBe(18 + 3 + 2)
    // parseCharacteristics ждёт <li><strong>Ключ:</strong> Значение</li>.
    expect(chars).toContain('<li><strong>Реактивов в наборе:</strong> 17</li>')
    expect(chars).toContain('<li><strong>Размер упаковки:</strong> 17 × 15 × 12 см</li>')
    expect(chars).toContain('<li><strong>Вес:</strong> 1 кг</li>')
  })

  it('концентрации и объёмы совпадают с присланным составом', () => {
    const [contents] = htmlOf(buildMiniHimichkaBlocks())
    for (const fragment of [
      'серная кислота 10%, 65 мл',
      'гидроксид натрия 10%, 65 мл',
      'раствор нитрата серебра 1%',
      'раствор сульфата алюминия 7%',
      'раствор хлорида бария 3%',
      'раствор дихромата калия 3%',
      'раствор перманганата калия 1%',
      'раствор сульфата кобальта 5%',
      'раствор нитрата никеля 5%',
      'раствор сульфата меди 6%',
      'раствор сульфата железа (II) 7%',
      'раствор карбоната аммония 7%',
      'раствор иодида калия 5%',
      'раствор фосфата калия 7%',
      'цинк в гранулах, 4 г',
      'железо в порошке, 4 г',
      'сульфит натрия в порошке, 4 г',
      'фенолфталеин, 1%, 20 мл',
      'пробирки химические, 2 шт.',
      'мерная ложечка-шпатель, 1 шт.',
      'пипетка Пастера, 1 шт.',
      'информационная листовка, 1 шт.',
      'печатной методички в комплекте нет — только электронная версия',
    ]) {
      expect(contents, fragment).toContain(fragment)
    }
  })

  it('формулы получают индексы', () => {
    const [contents] = htmlOf(buildMiniHimichkaBlocks())
    expect(contents).toContain('Al<sub>2</sub>(SO<sub>4</sub>)<sub>3</sub>')
    expect(contents).toContain('K<sub>2</sub>Cr<sub>2</sub>O<sub>7</sub>')
    expect(contents).toContain('(NH<sub>4</sub>)<sub>2</sub>CO<sub>3</sub>')
    expect(contents).toContain('Ni(NO<sub>3</sub>)<sub>2</sub>')
    expect(contents).toContain('<strong>H<sub>2</sub>SO<sub>4</sub></strong>')
  })
})

describe('applyMiniHimichkaCard на настоящем Postgres', () => {
  const intro = { type: 'paragraph', html: '<p>Набор с минимально необходимой посудой</p>' }

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE TABLE "products" RESTART IDENTITY CASCADE')
  })

  async function seedCard(longDescriptionBlocks: unknown[] = [intro]) {
    return AppDataSource.getRepository(Product).save({
      slug: MINI_SLUG,
      name: 'Мини-Химичка',
      priceRub: 1699,
      shortDescription: 'Короткое описание',
      metaDescription: 'Мета',
      longDescriptionBlocks: longDescriptionBlocks as never,
    })
  }

  async function readCard() {
    return AppDataSource.getRepository(Product).findOneOrFail({ where: { slug: MINI_SLUG } })
  }

  it('дописывает «Состав» и «Характеристики» после существующего описания, остальное не трогает', async () => {
    await seedCard()
    const report = await applyMiniHimichkaCard(AppDataSource)

    expect(report.before.longDescriptionBlocks).toEqual([intro])
    const card = await readCard()
    expect(card.longDescriptionBlocks).toEqual([intro, ...buildMiniHimichkaBlocks()])
    expect(card.shortDescription).toBe('Короткое описание')
    expect(card.metaDescription).toBe('Мета')
    expect(card.priceRub).toBe(1699)
  })

  it('идемпотентен: повторный запуск не дублирует блоки', async () => {
    await seedCard()
    await applyMiniHimichkaCard(AppDataSource)
    await applyMiniHimichkaCard(AppDataSource)
    const html = htmlOf((await readCard()).longDescriptionBlocks)
    expect(html.filter((h) => CONTENTS_RE.test(h))).toHaveLength(1)
    expect(html.filter((h) => CHARACTERISTICS_RE.test(h))).toHaveLength(1)
  })

  it('заменяет старые «Состав»/«Характеристики», сохраняя прочие блоки', async () => {
    await seedCard([
      intro,
      { type: 'paragraph', html: '<h3>Состав</h3><ul><li>старое</li></ul>' },
      {
        type: 'paragraph',
        html: '<h3>Характеристики</h3><ul><li><strong>Вес:</strong> 9 кг</li></ul>',
      },
      { type: 'paragraph', html: '<p>Хвост</p>' },
    ])
    await applyMiniHimichkaCard(AppDataSource)
    const blocks = (await readCard()).longDescriptionBlocks
    const html = htmlOf(blocks)
    expect(html).toContain('<p>Набор с минимально необходимой посудой</p>')
    expect(html).toContain('<p>Хвост</p>')
    expect(JSON.stringify(blocks)).not.toContain('старое')
    expect(JSON.stringify(blocks)).not.toContain('9 кг')
    expect(html.filter((h) => CONTENTS_RE.test(h))).toHaveLength(1)
  })

  it('dry-run ничего не пишет', async () => {
    await seedCard()
    const report = await applyMiniHimichkaCard(AppDataSource, { dryRun: true })
    expect(report.dryRun).toBe(true)
    expect((await readCard()).longDescriptionBlocks).toEqual([intro])
  })

  it('без товара в БД падает с понятной ошибкой и ничего не создаёт', async () => {
    await expect(applyMiniHimichkaCard(AppDataSource)).rejects.toThrow(MINI_SLUG)
    expect(await AppDataSource.getRepository(ProductImage).count()).toBe(0)
  })
})
