import 'reflect-metadata'
import 'dotenv/config'
import argon2 from 'argon2'
import pino from 'pino'
import { AppDataSource } from '../config/dataSource.js'
import { Product } from '../entities/Product.js'
import { ProductCategory } from '../entities/ProductCategory.js'
import { Page } from '../entities/Page.js'
import { AdminUser } from '../entities/AdminUser.js'

const logger = pino().child({ mod: 'seed' })

// LOCAL DEV ONLY — change before any real deploy.
// This password is hashed via argon2 and the resulting hash stored in admin_users.
// Do not reuse this account (or this password) in any shared or production environment.
const ADMIN_EMAIL = 'admin@ximi4ka.local'
const ADMIN_PASSWORD = 'admin-password-change-me'

type CatSlug =
  | 'himicheskie-nabory'
  | 'eksperimentalnye-nabory'
  | 'obrazovatelnye-materialy'

const categorySeed: Array<{ slug: CatSlug; name: string; sortOrder: number }> = [
  { slug: 'himicheskie-nabory', name: 'Химические наборы', sortOrder: 1 },
  { slug: 'eksperimentalnye-nabory', name: 'Экспериментальные наборы', sortOrder: 2 },
  { slug: 'obrazovatelnye-materialy', name: 'Образовательные материалы', sortOrder: 3 },
]

// Block shapes here mirror shared/src/types/blocks.ts. We keep a local type to
// avoid importing frontend/shared into the API's build graph; these JSONB
// payloads are untyped at the DB layer and only validated by the renderer
// at runtime via isBlock.
type ParagraphBlockSeed = { type: 'paragraph'; html: string }
type ImageBlockSeed = {
  type: 'image'
  url: string
  alt: string
  caption?: string
}
type CtaBlockSeed = {
  type: 'cta'
  heading: string
  subtext?: string
  buttonLabel: string
  buttonHref: string
}
type FaqBlockSeed = {
  type: 'faq'
  items: Array<{ question: string; answer: string }>
}
type SeedBlock = ParagraphBlockSeed | ImageBlockSeed | CtaBlockSeed | FaqBlockSeed

interface ProductSeed {
  slug: string
  name: string
  shortDescription: string
  priceRub: number
  compareAtPriceRub?: number
  stockStatus: 'in_stock' | 'out_of_stock' | 'preorder'
  isPublished: boolean
  categorySlugs: CatSlug[]
  longDescriptionBlocks: SeedBlock[]
  sortOrder: number
}

const productSeed: ProductSeed[] = [
  {
    slug: 'nabor-yunogo-himika',
    name: 'Набор Юного Химика',
    shortDescription:
      'Классический стартовый набор для будущего химика: безопасные реактивы и пошаговые инструкции к десяти ярким опытам.',
    priceRub: 2490,
    compareAtPriceRub: 2990,
    stockStatus: 'in_stock',
    isPublished: true,
    categorySlugs: ['himicheskie-nabory', 'obrazovatelnye-materialy'],
    longDescriptionBlocks: [
      {
        type: 'paragraph',
        html: '<p>В наборе собраны все необходимые <strong>реактивы и оборудование</strong> для знакомства ребёнка с миром химии. Каждый опыт сопровождается иллюстрированной инструкцией и объяснением происходящих реакций.</p>',
      },
      {
        type: 'image',
        url: '/next.svg',
        alt: 'Пример реактивов из набора',
        caption: 'Все реактивы прошли проверку безопасности',
      },
      {
        type: 'paragraph',
        html: '<p>Возрастная маркировка <em>8+</em>. Опыты безопасны и проводятся под наблюдением взрослых. В комплект входят защитные очки, перчатки и подробный буклет.</p>',
      },
      {
        type: 'faq',
        items: [
          {
            question: 'Подходит ли набор для школьных уроков?',
            answer: 'Да, набор используется в школьных кружках и на уроках естествознания.',
          },
          {
            question: 'Нужны ли дополнительные материалы?',
            answer: 'Нет, всё необходимое уже в комплекте. Понадобится только чистая вода.',
          },
        ],
      },
    ],
    sortOrder: 1,
  },
  {
    slug: 'vulkan-lavy',
    name: 'Извергающийся Вулкан',
    shortDescription:
      'Соберите настоящий вулкан и наблюдайте эффектное извержение лавы — классический опыт с безопасной химической реакцией.',
    priceRub: 1490,
    stockStatus: 'in_stock',
    isPublished: true,
    categorySlugs: ['eksperimentalnye-nabory'],
    longDescriptionBlocks: [
      {
        type: 'paragraph',
        html: '<p>Набор включает гипсовый корпус вулкана, краски, реактивы и подставку. После сборки вы сможете провести извержение десятки раз.</p>',
      },
      {
        type: 'paragraph',
        html: '<p>Идеально подходит для школьных презентаций и домашних экспериментов. Возраст 7+.</p>',
      },
    ],
    sortOrder: 2,
  },
  {
    slug: 'kristalli-cvetnye',
    name: 'Цветные Кристаллы',
    shortDescription:
      'Вырастите собственные разноцветные кристаллы за несколько дней и узнайте, как растворы превращаются в геометрически правильные структуры.',
    priceRub: 990,
    stockStatus: 'in_stock',
    isPublished: true,
    categorySlugs: ['eksperimentalnye-nabory', 'obrazovatelnye-materialy'],
    longDescriptionBlocks: [
      {
        type: 'paragraph',
        html: '<p>В комплект входят четыре вида солей, контейнеры для выращивания и пошаговая инструкция. Наблюдайте, как из пересыщенного раствора появляются кристаллы красного, синего, зелёного и фиолетового цветов.</p>',
      },
      {
        type: 'paragraph',
        html: '<p>Процесс занимает от трёх до семи дней и не требует специального оборудования. Отличный подарок для любознательных детей от 8 лет.</p>',
      },
    ],
    sortOrder: 3,
  },
  {
    slug: 'slizni-razum',
    name: 'Умные Слизни',
    shortDescription:
      'Сделайте собственный слайм и изучите реологию неньютоновских жидкостей — липко, тягуче и познавательно.',
    priceRub: 790,
    stockStatus: 'in_stock',
    isPublished: true,
    categorySlugs: ['eksperimentalnye-nabory'],
    longDescriptionBlocks: [
      {
        type: 'paragraph',
        html: '<p>Четыре варианта рецептов: классический слайм, магнитный слайм, светящийся в темноте и термочувствительный. В комплекте — безопасные полимеры и красители.</p>',
      },
      {
        type: 'paragraph',
        html: '<p>Подходит детям 6+. Все компоненты сертифицированы и соответствуют российским стандартам детской безопасности.</p>',
      },
    ],
    sortOrder: 4,
  },
  {
    slug: 'milokon',
    name: 'Мыловарение Домашнее',
    shortDescription:
      'Сварите ароматное мыло собственных форм и узнайте, как омыление превращает масла в средства гигиены.',
    priceRub: 1290,
    stockStatus: 'preorder',
    isPublished: true,
    categorySlugs: ['himicheskie-nabory'],
    longDescriptionBlocks: [
      {
        type: 'paragraph',
        html: '<p>Набор включает мыльную основу, ароматизаторы, красители и шесть силиконовых форм. Готовое мыло можно использовать уже через сутки после застывания.</p>',
      },
      {
        type: 'paragraph',
        html: '<p>Отличный повод поговорить с ребёнком о жирах, щелочах и химии повседневных вещей. Возраст 9+.</p>',
      },
    ],
    sortOrder: 5,
  },
  {
    slug: 'elektroliz-nabor',
    name: 'Электролиз и Металлы',
    shortDescription:
      'Изучите электрохимию на практике: разложите воду, покройте монету медью и соберите простую батарейку.',
    priceRub: 1890,
    stockStatus: 'out_of_stock',
    isPublished: true,
    categorySlugs: ['himicheskie-nabory', 'obrazovatelnye-materialy'],
    longDescriptionBlocks: [
      {
        type: 'paragraph',
        html: '<p>В набор входят электроды, держатели, растворы солей и инструкция с десятью экспериментами по электрохимии.</p>',
      },
      {
        type: 'paragraph',
        html: '<p>Питание — от батареек типа AA (в комплект не входят). Рекомендуется для подростков 11+ под присмотром взрослых.</p>',
      },
    ],
    sortOrder: 6,
  },
  {
    slug: 'nabor-pochvy',
    name: 'Исследуем Почву',
    shortDescription:
      'Мини-лаборатория для анализа почвы: определите кислотность, содержание азота и фосфора на собственном участке.',
    priceRub: 1690,
    stockStatus: 'in_stock',
    isPublished: true,
    categorySlugs: ['obrazovatelnye-materialy'],
    longDescriptionBlocks: [
      {
        type: 'paragraph',
        html: '<p>Тест-полоски и реагенты позволяют провести до двадцати анализов. К набору прилагается дневник юного почвоведа для записи результатов.</p>',
      },
      {
        type: 'paragraph',
        html: '<p>Отличный проект для школьной олимпиады или дачного лета. Возраст 10+.</p>',
      },
    ],
    sortOrder: 7,
  },
  {
    slug: 'molekuly-3d',
    name: '3D Модели Молекул',
    shortDescription:
      'Соберите объёмные модели воды, метана, глюкозы и ДНК — от атомов до сложных биомолекул.',
    priceRub: 2190,
    stockStatus: 'in_stock',
    // Draft: this product should NOT appear on /api/public/products.
    isPublished: false,
    categorySlugs: ['obrazovatelnye-materialy'],
    longDescriptionBlocks: [
      {
        type: 'paragraph',
        html: '<p>Более ста атомов разных цветов, соединительные стержни и подробное руководство по сборке двадцати молекул органической и неорганической химии.</p>',
      },
      {
        type: 'paragraph',
        html: '<p>Рекомендуется для старшей школы (14+) и студентов-первокурсников. Хорошее дополнение к учебникам химии и биологии.</p>',
      },
    ],
    sortOrder: 8,
  },
]

const pageSeed: Array<{
  slug: string
  title: string
  blocks: SeedBlock[]
}> = [
  {
    slug: 'home',
    title: 'Главная',
    blocks: [
      {
        type: 'paragraph',
        html: '<p><strong>Ximi4ka</strong> — наборы для химических опытов дома. Реагенты, лабораторная посуда и протоколы к каждому эксперименту: ребёнок проводит опыты сам и понимает, что происходит.</p>',
      },
      {
        type: 'cta',
        heading: 'Наборы в подарок ребёнку',
        subtext: 'Собрали готовый комплект для первого опыта — со скидкой до 20% до конца месяца.',
        buttonLabel: 'Смотреть каталог',
        buttonHref: '/categories',
      },
      {
        type: 'faq',
        items: [
          {
            question: 'Безопасны ли наборы для детей?',
            answer: 'Все реактивы проходят сертификацию по ГОСТ. Наборы разработаны педагогами и химиками и соответствуют возрастным маркировкам.',
          },
          {
            question: 'Как быстро доставите заказ?',
            answer: 'По Москве — в течение 1–2 рабочих дней, по России — 3–7 дней через СДЭК и Почту России.',
          },
          {
            question: 'Можно ли вернуть набор?',
            answer: 'Да, в течение 14 дней с момента получения, если набор не был вскрыт.',
          },
        ],
      },
    ],
  },
  {
    slug: 'o-nas',
    title: 'О нас',
    blocks: [
      {
        type: 'paragraph',
        html: '<p>Команда Ximi4ka собирает наборы для экспериментов с 2019 года. Мы верим, что наука — это весело, и хотим, чтобы каждый ребёнок мог сам провести свой первый опыт.</p>',
      },
      {
        type: 'paragraph',
        html: '<p>Наши наборы используют в школах, кружках робототехники и на домашних уроках по всей стране.</p>',
      },
    ],
  },
  {
    slug: 'dostavka',
    title: 'Доставка и оплата',
    blocks: [
      {
        type: 'paragraph',
        html: '<p>Доставка по России курьерскими службами и Почтой России. Оплата онлайн через Yandex Pay или наличными при получении.</p>',
      },
      {
        type: 'paragraph',
        html: '<p>Все заказы упакованы в ударопрочную коробку. Хрупкая лабораторная посуда дополнительно защищена пузырчатой плёнкой.</p>',
      },
    ],
  },
  {
    slug: 'kontakty',
    title: 'Контакты',
    blocks: [
      {
        type: 'paragraph',
        html: '<p>Вопросы и предложения: hello@ximi4ka.ru. Мы отвечаем в течение рабочего дня. Телефон горячей линии указан в подвале сайта.</p>',
      },
    ],
  },
]

async function seed() {
  await AppDataSource.initialize()

  try {
    // Clear existing data — seed is idempotent; re-runs give a clean slate.
    // CASCADE handles the product_category_links join table and product_images.
    await AppDataSource.query(
      'TRUNCATE products, product_images, product_categories, pages, admin_sessions, admin_users RESTART IDENTITY CASCADE',
    )
    logger.info('truncated seed tables')

    const categoryRepo = AppDataSource.getRepository(ProductCategory)
    const productRepo = AppDataSource.getRepository(Product)
    const pageRepo = AppDataSource.getRepository(Page)
    const adminRepo = AppDataSource.getRepository(AdminUser)

    // Categories
    const categoriesBySlug = new Map<CatSlug, ProductCategory>()
    for (const c of categorySeed) {
      const saved = await categoryRepo.save(categoryRepo.create(c))
      categoriesBySlug.set(c.slug, saved)
    }
    logger.info({ count: categoriesBySlug.size }, 'categories created')

    // Products
    for (const p of productSeed) {
      const entity = productRepo.create({
        slug: p.slug,
        name: p.name,
        shortDescription: p.shortDescription,
        longDescriptionBlocks: p.longDescriptionBlocks,
        priceRub: p.priceRub,
        compareAtPriceRub: p.compareAtPriceRub ?? null,
        stockStatus: p.stockStatus,
        isPublished: p.isPublished,
        sortOrder: p.sortOrder,
        categories: p.categorySlugs.map((s) => {
          const cat = categoriesBySlug.get(s)
          if (!cat) throw new Error(`seed misconfigured: category ${s} not found`)
          return cat
        }),
      })
      await productRepo.save(entity)
    }
    logger.info({ count: productSeed.length }, 'products created')

    // Pages
    for (const pg of pageSeed) {
      await pageRepo.save(
        pageRepo.create({
          slug: pg.slug,
          title: pg.title,
          blocks: pg.blocks,
          isPublished: true,
        }),
      )
    }
    logger.info({ count: pageSeed.length }, 'pages created')

    // Admin user
    const passwordHash = await argon2.hash(ADMIN_PASSWORD)
    await adminRepo.save(
      adminRepo.create({
        email: ADMIN_EMAIL,
        passwordHash,
        role: 'admin',
      }),
    )
    logger.info({ email: ADMIN_EMAIL }, 'admin user created')

    logger.info('seed complete')
  } finally {
    await AppDataSource.destroy()
  }
}

seed().catch((err) => {
  logger.error({ err }, 'seed failed')
  process.exit(1)
})
