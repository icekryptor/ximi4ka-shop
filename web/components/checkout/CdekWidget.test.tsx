import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// next/script в тестах: сразу вызываем onReady, как будто скрипт загрузился.
vi.mock('next/script', () => ({
  default: ({ onReady }: { onReady?: () => void }) => {
    onReady?.()
    return null
  },
}))

import { CdekWidget } from './CdekWidget'

const props = {
  goods: [{ weight: 180, length: 10, width: 10, height: 4 }],
  servicePath: 'https://shop/api/public/cdek/widget?subtotal=1000',
  tariffs: { pvz: 136, courier: 137 },
  onChoose: vi.fn(),
}

describe('<CdekWidget>', () => {
  const ORIGINAL_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
  let ctor: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ctor = vi.fn()
    ;(window as unknown as { CDEKWidget: unknown }).CDEKWidget = ctor
  })
  afterEach(() => {
    if (ORIGINAL_KEY == null) delete process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
    else process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY = ORIGINAL_KEY
    delete (window as unknown as { CDEKWidget?: unknown }).CDEKWidget
  })

  it('без ключа Яндекс.Карт не грузит виджет и объясняет, что делать', () => {
    delete process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY
    render(<CdekWidget {...props} />)
    expect(screen.getByRole('status')).toHaveTextContent(/карта недоступна/i)
    expect(ctor).not.toHaveBeenCalled()
  })

  it('создаёт виджет с нашими местами, прокси, тарифами и ключом', () => {
    process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY = 'ya-key'
    render(<CdekWidget {...props} />)
    expect(ctor).toHaveBeenCalledTimes(1)
    const config = ctor.mock.calls[0][0]
    expect(config).toMatchObject({
      apiKey: 'ya-key',
      servicePath: props.servicePath,
      goods: props.goods,
      tariffs: { office: [136], door: [137] },
      canChoose: true,
      lang: 'rus',
      currency: 'RUB',
    })
    expect(typeof config.onChoose).toBe('function')
  })

  it('передаёт выбор покупателя наружу', () => {
    process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY = 'ya-key'
    const onChoose = vi.fn()
    render(<CdekWidget {...props} onChoose={onChoose} />)
    const tariff = { tariff_code: 136, period_min: 3, period_max: 5 }
    const address = {
      city_code: 270,
      city: 'Новосибирск',
      code: 'NSK1',
      address: 'ул. Кривощековская, 15',
    }
    ctor.mock.calls[0][0].onChoose('office', tariff, address)
    expect(onChoose).toHaveBeenCalledWith('office', tariff, address)
  })
})
