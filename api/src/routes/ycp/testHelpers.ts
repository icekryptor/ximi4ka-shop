import request from 'supertest'
import type { Express } from 'express'
import { AppDataSource } from '../../config/dataSource.js'
import { Order } from '../../entities/Order.js'
import { Product } from '../../entities/Product.js'
import { ProductCategory } from '../../entities/ProductCategory.js'
import type { PickupPointEntry } from '../../lib/ycp/pickupPoints.js'

// Общие данные тестов YCP. Не *.test.ts: файл импортируют тесты, сам он тестов
// не содержит (как routes/testUtils.ts). vitest сюда не импортируем — подмену
// окружения тест передаёт сам: applyYcpTestEnv((k, v) => vi.stubEnv(k, v)).

export const YCP_TEST_TOKEN = 'ycp-test-token-0123456789abcdef0123456789abcdef'

export const YCP_TEST_ENV: Readonly<Record<string, string>> = {
  YCP_API_TOKEN: YCP_TEST_TOKEN,
  YCP_WAREHOUSE_ID: 'msk-1',
  YCP_WAREHOUSE_TITLE: 'Склад Химички',
  YCP_WAREHOUSE_ADDRESS: 'Москва, ул. Примерная, 1',
  YCP_WAREHOUSE_PHONE: '+7 (495) 000-00-00',
  WEB_ORIGIN: 'https://new.ximi4ka.ru',
  CDEK_FROM_CITY_CODE: '44',
  CDEK_TARIFF_PVZ: '136',
  CDEK_TARIFF_COURIER: '137',
}

export const ycpAuth: Record<string, string> = { Authorization: `Bearer ${YCP_TEST_TOKEN}` }

export function applyYcpTestEnv(stub: (name: string, value: string) => unknown): void {
  for (const [name, value] of Object.entries(YCP_TEST_ENV)) stub(name, value)
}

// Товар, доступный для кнопки: опубликован, в наличии, флаг ycpEnabled.
// Вес 800 г, без своих коробок — одна штука едет в малой коробке (830 г, 10×10×4 см).
export async function seedYcpProduct(overrides: Partial<Product> = {}): Promise<Product> {
  const repo = AppDataSource.getRepository(Product)
  return repo.save(
    repo.create({
      slug: `ycp-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Набор юного химика',
      sku: 'XIM-001',
      priceRub: 1500,
      stockStatus: 'in_stock',
      isPublished: true,
      ycpEnabled: true,
      weightG: 800,
      longDescriptionBlocks: [],
      translations: {},
      ...overrides,
    }),
  )
}

export async function seedCategory(slug: string, products: Product[]): Promise<ProductCategory> {
  const repo = AppDataSource.getRepository(ProductCategory)
  return repo.save(repo.create({ slug, name: slug, translations: {}, products }))
}

export interface YcpTestItem {
  id: string
  quantity: number
  regular_price: number
  final_price: number
}

// Тело POST /api/v1/checkout как в примере Яндекса (ПВЗ). overrides —
// поля верхнего уровня (session_id, delivery, customer…).
export function ycpCheckoutBody(
  items: YcpTestItem[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    session_id: 'sess-0001',
    warehouse_id: 'msk-1',
    items,
    customer: { full_name: 'Иван Иванов', phone: '+79991234567', email: 'ivan@example.com' },
    delivery: {
      delivery_method: 'pickup_point',
      service_type: 'merchant_ship',
      price: 350,
      address: { pickup_point_id: 'MSK1', locality: 'Москва', address: 'ул. Тестовая, 1' },
      delivery_date_interval: {
        start_interval: { date: '2026-10-14' },
        end_interval: { date: '2026-10-16' },
        time_zone: 3,
      },
      ycp_delivery_option_id: 'pvz-136-44',
    },
    ...overrides,
  }
}

export function makePickupEntry(code = 'MSK1', cityCode = 44): PickupPointEntry {
  return {
    cityCode,
    point: {
      id: code,
      name: `Пункт ${code}`,
      address: 'Москва, ул. Тестовая, 1',
      is_cash_available: true,
      is_card_available: true,
      working_hours: { mon: '10:00-20:00' },
      coordinates: { lat: 55.75, lon: 37.62 },
      time_zone: 3,
      display_service_type: 'cdek',
    },
  }
}

// Заказ из Яндекса через настоящий POST /api/v1/checkout — для тестов placed и
// отмен. Окружение YCP тест подменяет сам до вызова.
export async function createYcpCheckout(app: Express, sessionId: string): Promise<Order> {
  const product = await seedYcpProduct()
  const res = await request(app)
    .post('/api/v1/checkout')
    .set(ycpAuth)
    .send(
      ycpCheckoutBody(
        [
          {
            id: product.id,
            quantity: 1,
            regular_price: product.priceRub,
            final_price: product.priceRub,
          },
        ],
        { session_id: sessionId },
      ),
    )
  if (res.status !== 201) {
    throw new Error(`createYcpCheckout: ${res.status} ${JSON.stringify(res.body)}`)
  }
  return AppDataSource.getRepository(Order).findOneByOrFail({ externalSessionId: sessionId })
}
