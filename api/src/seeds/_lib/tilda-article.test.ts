import { describe, it, expect } from 'vitest'
import {
  ARTICLE_SOURCES,
  CHROME_RECORD_IDS,
  deriveExcerpt,
  extractArticleBlocks,
  extractCanonicalUrl,
  extractMetaDescription,
  splitRecords,
} from './tilda-article.js'

// ---- fixtures -------------------------------------------------------------

const rec = (id: string, type: string, inner: string) =>
  `<div id="${id}" class="r t-rec" style=" " data-record-type="${type}">${inner}</div> `

// t030 heading record (field="title" can live on an h2 OR a div).
const headingRec = (id: string, text: string, tag = 'h2') =>
  rec(
    id,
    '33',
    `<div class="t030"><div class="t-container"><div class="t-col t-col_10">` +
      `<${tag} class="t030__title t-title t-title_xs" field="title">${text}</${tag}>` +
      `</div></div></div>`,
  )

// t004 text record.
const textRec = (id: string, html: string) =>
  rec(
    id,
    '106',
    `<div class="t004"><div class="t-container "><div class="t-col t-col_7 ">` +
      `<div field="text" class="t-text t-text_md ">${html}</div>` +
      `</div></div></div>`,
  )

// Zero-block elements. Flexed elems (t396__elem-flex) belong to promo groups.
const zeroText = (text: string, opts: { flex?: boolean; h1?: boolean } = {}) => {
  const flexCls = opts.flex ? ' t396__elem-flex' : ''
  const tag = opts.h1 ? 'h1' : 'div'
  return (
    `<div class='t396__elem tn-elem${flexCls} tn-elem__x1' data-elem-id='1' data-elem-type='text'>` +
    `<${tag} class='tn-atom'field='tn_text_1'>${text}</${tag}></div>`
  )
}
const zeroImage = (url: string, alt: string, flex = false) =>
  `<div class='t396__elem tn-elem${flex ? ' t396__elem-flex' : ''} tn-elem__x2' data-elem-id='2' data-elem-type='image'>` +
  `<div class='tn-atom'> <img class='tn-atom__img t-img' data-original='${url}'\nsrc='https://thb.tildacdn.com/x/-/resize/20x/x.png'\nalt='${alt}' imgfield='tn_img_2'\n/> </div></div>`
const zeroBgShape = (url: string, width: number, flex = false) =>
  `<div class='t396__elem tn-elem${flex ? ' t396__elem-flex' : ''} tn-elem__x3' data-elem-id='3' data-elem-type='shape' data-field-top-value="0" data-field-left-value="20" data-field-height-value="600" data-field-width-value="${width}">` +
  `<div class='tn-atom t-bgimg' data-original="${url}"\naria-label='' role="img"> </div></div>`
const zeroButton = (label: string) =>
  `<div class='t396__elem tn-elem t396__elem-flex tn-elem__x4' data-elem-id='4' data-elem-type='button'>` +
  `<a class='tn-atom' href="/catalog">${label}</a></div>`

const zeroRec = (id: string, elems: string) =>
  rec(id, '396', `<div class='t396'><div class="t396__artboard">${elems}</div></div>`)

// t668 FAQ accordion (question in li_title span, answer in li_descr div).
const faqRec = (id: string, items: Array<[string, string]>) =>
  rec(
    id,
    '668',
    `<div class="t668">${items
      .map(
        ([q, a], i) =>
          `<div class="t668__col"><span class="t668__title t-name" field="li_title__${i}" style="">${q}</span>` +
          `<div class="t668__text t-descr" field="li_descr__${i}" style="">${a}</div></div>`,
      )
      .join('')}</div>`,
  )

// t1861 table (rows of three positioned texts inside nested flex groups).
const tableCell = (top: number, left: number, text: string) =>
  `<div class='t396__elem tn-elem t396__elem-flex tn-elem__t${top}${left}' data-elem-id='${top}${left}' data-elem-type='text' data-field-top-value="${top}" data-field-left-value="${left}">` +
  `<div class='tn-atom'field='tn_text_${top}${left}'>${text}</div></div>`
const tableRec = (id: string, cells: string) =>
  rec(id, '1861', `<div class='t396'><div class="t396__artboard">${cells}</div></div>`)

// t1370 custom xp-blog record (per-grade sections with a promo sidebar).
const xpSection = (num: string, title: string, img: string, alt: string, ps: string[]) =>
  `<section class="xp-blog__grade"><div class="xp-blog__container"><div class="xp-blog__grade-wrapper">` +
  `<div class="xp-blog__grade-main"><div class="xp-blog__grade-number">${num}</div>` +
  `<h2 class="xp-blog__grade-title">${title}</h2>` +
  `<img class="xp-blog__grade-image" src="${img}" alt="${alt}">` +
  ps.map((p) => `<p class="xp-blog__grade-text">${p}</p>`).join('') +
  `</div><div class="xp-blog__grade-sidebar"><div class="xp-blog__sticky-card">` +
  `<img class="xp-blog__card-img" src="https://static.tildacdn.com/promo.png" alt="Промо">` +
  `<p class="xp-blog__grade-text">Промо-текст сайдбара</p>` +
  `</div></div></div></div></section>`
const xpRec = (id: string, sections: string) =>
  rec(id, '1370', `<div class="t1370"><div class="xp-blog">${sections}</div></div>`)

// ---- tests ----------------------------------------------------------------

describe('extractCanonicalUrl', () => {
  it('reads the canonical link href', () => {
    const html = `<head><link rel="canonical" href="https://ximi4ka.ru/blog/khimiya_v_shkole"></head>`
    expect(extractCanonicalUrl(html)).toBe('https://ximi4ka.ru/blog/khimiya_v_shkole')
  })

  it('returns null when missing', () => {
    expect(extractCanonicalUrl('<head></head>')).toBeNull()
  })
})

describe('extractMetaDescription', () => {
  it('reads and entity-decodes meta description', () => {
    const html = `<meta name="description" content="Химия 8 класс: обзор &amp; темы" />`
    expect(extractMetaDescription(html)).toBe('Химия 8 класс: обзор & темы')
  })

  it('returns null when missing or empty', () => {
    expect(extractMetaDescription('<head></head>')).toBeNull()
    expect(extractMetaDescription('<meta name="description" content="" />')).toBeNull()
  })
})

describe('splitRecords', () => {
  it('splits page HTML into records with id and type', () => {
    const html = headingRec('rec1', 'Заголовок') + textRec('rec2', 'Абзац')
    const records = splitRecords(html)
    expect(records.map((r) => ({ id: r.id, type: r.type }))).toEqual([
      { id: 'rec1', type: '33' },
      { id: 'rec2', type: '106' },
    ])
  })
})

describe('extractArticleBlocks', () => {
  const TITLE = 'Тестовая статья'

  it('maps t030 heading records to <h2> paragraph blocks (any tag carrying field="title")', () => {
    const html = headingRec('rec1', 'Первый раздел', 'h2') + headingRec('rec2', 'Второй', 'div')
    expect(extractArticleBlocks(html, TITLE)).toEqual([
      { type: 'paragraph', html: '<h2>Первый раздел</h2>' },
      { type: 'paragraph', html: '<h2>Второй</h2>' },
    ])
  })

  it('skips the «Наши наборы» promo section heading', () => {
    const html = headingRec('rec1', 'Наши наборы')
    expect(extractArticleBlocks(html, TITLE)).toEqual([])
  })

  it('maps t004 text records to paragraph blocks, splitting on double <br>', () => {
    const html = textRec('rec1', 'Первый абзац<br /><br />Второй <strong>жирный</strong> абзац')
    expect(extractArticleBlocks(html, TITLE)).toEqual([
      { type: 'paragraph', html: '<p>Первый абзац</p>' },
      { type: 'paragraph', html: '<p>Второй <strong>жирный</strong> абзац</p>' },
    ])
  })

  it('keeps lists inside t004 text records without an invalid <p> wrapper', () => {
    const html = textRec('rec1', 'Список:<br /><br /><ul><li data-list="bullet">Один</li></ul>')
    expect(extractArticleBlocks(html, TITLE)).toEqual([
      { type: 'paragraph', html: '<p>Список:</p>' },
      { type: 'paragraph', html: '<ul><li>Один</li></ul>' },
    ])
  })

  it('leaves mixed text+list chunks unwrapped (lists cannot nest inside <p>)', () => {
    const html = textRec('rec1', 'Преимущества:<br /><ul><li data-list="bullet">Один</li></ul>')
    expect(extractArticleBlocks(html, TITLE)).toEqual([
      { type: 'paragraph', html: 'Преимущества:<br><ul><li>Один</li></ul>' },
    ])
  })

  it('extracts zero-block content: skips h1/flex/button elems, keeps top-level text and images', () => {
    const html = zeroRec(
      'rec1',
      zeroText('Заголовок страницы', { h1: true }) +
        zeroText('Вводный абзац статьи') +
        zeroText('Подпишись на телеграм', { flex: true }) +
        zeroButton('Подписаться') +
        zeroImage('https://static.tildacdn.com/tild1234/cover.png', ''),
    )
    expect(extractArticleBlocks(html, TITLE)).toEqual([
      { type: 'paragraph', html: '<p>Вводный абзац статьи</p>' },
      // alt falls back to the article title when the crawl has an empty alt
      { type: 'image', url: 'https://static.tildacdn.com/tild1234/cover.png', alt: TITLE },
    ])
  })

  it('keeps wide background-image shapes and drops narrow/decorative ones', () => {
    const html = zeroRec(
      'rec1',
      zeroBgShape('https://static.tildacdn.com/tild9999/wide.png', 900) +
        zeroBgShape('https://static.tildacdn.com/tildsmall/sticky.png', 220) +
        zeroBgShape('https://static.tildacdn.com/tildflex/card.png', 900, true),
    )
    expect(extractArticleBlocks(html, TITLE)).toEqual([
      { type: 'image', url: 'https://static.tildacdn.com/tild9999/wide.png', alt: TITLE },
    ])
  })

  it('skips shared header/footer chrome records even when they contain text', () => {
    const html = CHROME_RECORD_IDS.map((id) =>
      zeroRec(id, zeroText('ХИМИЧКА') + zeroText('Поддержка')),
    ).join('')
    expect(extractArticleBlocks(html, TITLE)).toEqual([])
  })

  it('skips known chrome record types (menu, breadcrumbs, product cards, forms)', () => {
    const html = ['360', '131', '706', '758', '121', '247', '270']
      .map((t, i) => rec(`recChrome${i}`, t, `<div field="text">Не контент</div>`))
      .join('')
    expect(extractArticleBlocks(html, TITLE)).toEqual([])
  })

  it('reconstructs t1861 program tables into a list paragraph (rows grouped by top offset)', () => {
    const html = tableRec(
      'rec1',
      tableCell(40, 40, 'Первоначальные понятия') +
        tableCell(41, 320, 'атомы, молекулы') +
        tableCell(41, 620, 'язык всей химии') +
        tableCell(96, 40, 'Растворы') +
        tableCell(97, 320, 'растворимость') +
        tableCell(97, 620, 'связь с жизнью'),
    )
    expect(extractArticleBlocks(html, TITLE)).toEqual([
      {
        type: 'paragraph',
        html:
          '<ul>' +
          '<li><strong>Первоначальные понятия</strong> — атомы, молекулы (язык всей химии)</li>' +
          '<li><strong>Растворы</strong> — растворимость (связь с жизнью)</li>' +
          '</ul>',
      },
    ])
  })

  it('maps t668 accordions to faq blocks', () => {
    const html = faqRec('rec1', [
      ['Что учить в первую очередь?', 'Таблицу Менделеева и валентность.'],
      ['Нужно ли зубрить?', 'Нет, нужно уметь читать таблицу.'],
    ])
    expect(extractArticleBlocks(html, TITLE)).toEqual([
      {
        type: 'faq',
        items: [
          { question: 'Что учить в первую очередь?', answer: 'Таблицу Менделеева и валентность.' },
          { question: 'Нужно ли зубрить?', answer: 'Нет, нужно уметь читать таблицу.' },
        ],
      },
    ])
  })

  it('maps t1370 xp-blog sections to heading/image/paragraph blocks, skipping the promo sidebar', () => {
    const html = xpRec(
      'rec1',
      xpSection('8', 'Химия с нуля', 'https://static.tildacdn.com/tild8/photo.jpg', '8 класс', [
        'Первый текст.',
        'Второй текст с <b>жирным</b>.',
      ]),
    )
    expect(extractArticleBlocks(html, TITLE)).toEqual([
      { type: 'paragraph', html: '<h2>8 класс — Химия с нуля</h2>' },
      { type: 'image', url: 'https://static.tildacdn.com/tild8/photo.jpg', alt: '8 класс' },
      { type: 'paragraph', html: '<p>Первый текст.</p>' },
      { type: 'paragraph', html: '<p>Второй текст с <b>жирным</b>.</p>' },
    ])
  })

  it('sanitizes script injections out of text content', () => {
    const html = textRec('rec1', 'Привет<script>alert(1)</script> мир')
    const blocks = extractArticleBlocks(html, TITLE)
    expect(blocks).toHaveLength(1)
    expect((blocks[0] as { html: string }).html).not.toContain('script')
  })
})

describe('deriveExcerpt', () => {
  it('takes the first real paragraph, strips tags, keeps it under 200 chars', () => {
    const blocks = [
      { type: 'paragraph' as const, html: '<h2>Заголовок</h2>' },
      { type: 'paragraph' as const, html: '<p>Первый <strong>содержательный</strong> абзац.</p>' },
      { type: 'paragraph' as const, html: '<p>Второй абзац.</p>' },
    ]
    expect(deriveExcerpt(blocks)).toBe('Первый содержательный абзац.')
  })

  it('truncates long paragraphs at a word boundary with an ellipsis', () => {
    const word = 'слово'
    const long = Array(60).fill(word).join(' ')
    const excerpt = deriveExcerpt([{ type: 'paragraph', html: `<p>${long}</p>` }])
    expect(excerpt.length).toBeLessThanOrEqual(201)
    expect(excerpt.endsWith('…')).toBe(true)
    expect(excerpt).not.toContain('слов…') // no mid-word cuts
  })

  it('returns null when there is no paragraph content', () => {
    expect(deriveExcerpt([])).toBeNull()
    expect(deriveExcerpt([{ type: 'paragraph', html: '<h2>Только заголовок</h2>' }])).toBeNull()
  })
})

describe('ARTICLE_SOURCES', () => {
  it('lists the four articles in publish order (oldest first)', () => {
    expect(ARTICLE_SOURCES.map((a) => a.slug)).toEqual([
      'khimiya-v-shkole',
      'nabory-dlya-opytov-himichka',
      'podhodyat-li-nabory-dlya-oge',
      'himiya-8-klass-programma',
    ])
    // publishedDaysAgo: first article oldest, last freshest
    expect(ARTICLE_SOURCES.map((a) => a.publishedDaysAgo)).toEqual([3, 2, 1, 0])
  })

  it('keeps slugs kebab-case and source URLs on ximi4ka.ru', () => {
    for (const a of ARTICLE_SOURCES) {
      expect(a.slug).toMatch(/^[a-z0-9-]+$/)
      expect(a.sourceUrl).toMatch(/^https:\/\/ximi4ka\.ru\//)
      expect(a.title.length).toBeGreaterThan(10)
      expect(a.rubric.length).toBeGreaterThan(3)
    }
  })
})
