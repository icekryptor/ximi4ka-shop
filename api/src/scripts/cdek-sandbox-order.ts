// Живой прогон тела заказа в песочнице СДЭК: собирает заказ той же
// buildCdekOrder, отправляет общей тестовой учёткой и ждёт итог регистрации.
// Проверяет, что тело проходит настоящую валидацию СДЭК. Только песочница.
//   npx tsx api/src/scripts/cdek-sandbox-order.ts
import { CdekClient, PUBLIC_TEST_CREDENTIALS, TEST_BASE_URL } from '../lib/cdek/client.js'
import { buildCdekOrder, type CdekOrderConfig } from '../lib/cdek/orders.js'

const config: CdekOrderConfig = {
  shipmentPoint: 'MOS4',
  sender: { company: 'ИП Тест', name: 'Тест Тестов', phone: '+79990000000', email: null },
  sellerName: 'ИП Тест',
  tariffPvz: 136,
  tariffCourier: 137,
}

type Info = {
  entity?: { uuid?: string; cdek_number?: string }
  requests?: { type?: string; state?: string; errors?: unknown }[]
}

// tsc (module: NodeNext) не принял бы top-level await в этом файле без
// проверки его совместимости — оборачиваем тело в main(), как в migrate.ts.
async function main() {
  const client = new CdekClient({ baseUrl: TEST_BASE_URL, ...PUBLIC_TEST_CREDENTIALS })
  const number = `XM-SANDBOX-${Date.now()}`

  const body = buildCdekOrder(
    {
      orderNumber: number,
      customerName: 'Иван Проба',
      customerPhone: '8 (999) 111-22-33',
      customerEmail: '',
      deliveryMethod: 'cdek_pvz',
      deliveryAddress: {
        address: 'Москва',
        comment: null,
        cityCode: 44,
        deliveryPointCode: 'MOS4',
      },
    },
    [
      {
        box: 'small',
        weightG: 300,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 4,
        estimated: false,
        items: [{ productId: 'p1', quantity: 2 }],
      },
      {
        box: 'large',
        weightG: 1000,
        lengthCm: 40,
        widthCm: 32,
        heightCm: 8,
        estimated: false,
        items: [{ productId: 'kit', quantity: 1 }],
      },
      {
        box: 'large',
        weightG: 1000,
        lengthCm: 40,
        widthCm: 32,
        heightCm: 8,
        estimated: false,
        items: [],
      },
    ],
    [
      {
        productId: 'p1',
        name: 'Хлорид железа III',
        sku: 'FECL3',
        unitPriceRub: 99,
        unitWeightG: 50,
      },
      { productId: 'kit', name: 'Химичка 3.0', sku: '7V25', unitPriceRub: 3299, unitWeightG: 2000 },
    ],
    config,
  )

  const created = await client.post<Info>('/orders', body)
  const uuid = created.entity?.uuid
  console.log('POST принят, uuid', uuid)
  for (let i = 0; i < 60 && uuid; i += 1) {
    await new Promise((r) => setTimeout(r, 5000))
    const info = await client.get<Info>(`/orders/${uuid}`)
    const req = info.requests?.find((r) => r.type === 'CREATE')
    console.log(
      `${(i + 1) * 5} с: ${req?.state}`,
      info.entity?.cdek_number ?? '',
      req?.errors ?? '',
    )
    if (req?.state === 'SUCCESSFUL' || req?.state === 'INVALID') break
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
