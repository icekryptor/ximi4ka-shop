// Вес и упаковка товаров из YML-фида Тильды (+ сверка цен).
//
//   npm run import:tilda-shipping -w api                    — живой фид, запись веса и упаковки
//   npm run import:tilda-shipping -w api -- --file x.yml    — из выгрузки
//   npm run import:tilda-shipping -w api -- --dry-run       — только отчёт
//   npm run import:tilda-shipping -w api -- --apply-prices  — заодно цены с Тильды
//
// Идемпотентный: повторный запуск ставит те же значения. Цены по умолчанию
// только показывает — Тильда пока источник правды по каталогу, но менять цены
// на витрине молча не стоит.
import 'reflect-metadata'
import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AppDataSource } from '../config/dataSource.js'
import { Product } from '../entities/Product.js'
import { parseTildaYmlOffers, planShippingImport } from './_lib/tilda-shipping.js'

const FEED_URL = 'https://ximi4ka.ru/tstore/yml/62928fb5bce82ec4969b2970be7f0b38.yml'
const here = path.dirname(fileURLToPath(import.meta.url))

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

async function loadFeed(): Promise<string> {
  const file = arg('--file')
  if (file) return readFile(file, 'utf8')
  const res = await fetch(FEED_URL)
  if (!res.ok) throw new Error(`фид Тильды ответил ${res.status}`)
  return res.text()
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const applyPrices = process.argv.includes('--apply-prices')

  const offers = parseTildaYmlOffers(await loadFeed())
  const idMap = JSON.parse(
    await readFile(path.join(here, '../../data/tilda-product-map.json'), 'utf8'),
  ) as Record<string, string>

  await AppDataSource.initialize()
  const repo = AppDataSource.getRepository(Product)
  const products = await repo.find({ select: ['slug', 'priceRub', 'compareAtPriceRub'] })
  const plan = planShippingImport(offers, idMap, products)

  console.log(`офферов в фиде: ${offers.length}, обновлений: ${plan.updates.length}`)
  if (plan.missingWeight.length) {
    console.log(`без веса (посчитаются по умолчанию): ${plan.missingWeight.join(', ')}`)
  }
  if (plan.unmapped.length) {
    console.log('в фиде, но не сопоставлено с каталогом:')
    for (const o of plan.unmapped) console.log(`  ${o.id} ${o.name}`)
  }
  if (plan.priceChanges.length) {
    console.log(
      `цены на Тильде отличаются${applyPrices ? ' — обновляю' : ' (--apply-prices, чтобы обновить)'}:`,
    )
    for (const c of plan.priceChanges) {
      console.log(
        `  ${c.slug}: ${c.from} → ${c.to} (старая ${c.fromOld ?? '—'} → ${c.toOld ?? '—'})`,
      )
    }
  }

  if (dryRun) {
    console.log('--dry-run: ничего не записано')
  } else {
    await AppDataSource.transaction(async (tx) => {
      for (const u of plan.updates) {
        await tx.update(
          Product,
          { slug: u.slug },
          {
            weightG: u.weightG,
            shipBoxes: u.shipBoxes,
            looseUnits: u.looseUnits,
            minBox: u.minBox,
          },
        )
      }
      if (applyPrices) {
        for (const c of plan.priceChanges) {
          await tx.update(Product, { slug: c.slug }, { priceRub: c.to, compareAtPriceRub: c.toOld })
        }
      }
    })
    console.log('записано')
  }
  await AppDataSource.destroy()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
