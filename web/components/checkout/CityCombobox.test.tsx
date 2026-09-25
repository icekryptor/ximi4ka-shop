import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { CdekCity } from '@ximi4ka-shop/shared'

const mockSuggest = vi.fn<(q: string, opts?: { signal?: AbortSignal }) => Promise<CdekCity[]>>()
vi.mock('@/lib/api', () => ({
  suggestCdekCities: (q: string, opts?: { signal?: AbortSignal }) => mockSuggest(q, opts),
}))

import { CityCombobox } from './CityCombobox'

const MOSCOW: CdekCity = { code: 44, name: 'Москва', fullName: 'Москва, Россия' }
const NALCHIK: CdekCity = {
  code: 1106,
  name: 'Нальчик',
  fullName: 'Нальчик, городской округ Нальчик, Кабардино-Балкария, Россия',
}
const NOVOSIB: CdekCity = {
  code: 270,
  name: 'Новосибирск',
  fullName: 'Новосибирск, Новосибирская область, Россия',
}
const NOVOROS: CdekCity = {
  code: 438,
  name: 'Новороссийск',
  fullName: 'Новороссийск, Краснодарский край, Россия',
}

// Поле управляемое: значение держит родитель, как на чекауте.
function Controlled({
  initial = null,
  onChange,
}: {
  initial?: CdekCity | null
  onChange: (city: CdekCity | null) => void
}) {
  const [value, setValue] = useState<CdekCity | null>(initial)
  return (
    <CityCombobox
      id="city"
      value={value}
      onChange={(city) => {
        setValue(city)
        onChange(city)
      }}
    />
  )
}

function input() {
  return screen.getByRole('combobox', { name: /город/i })
}

function type(value: string) {
  fireEvent.focus(input())
  fireEvent.change(input(), { target: { value } })
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  mockSuggest.mockReset()
  mockSuggest.mockResolvedValue([MOSCOW, NALCHIK])
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('<CityCombobox>', () => {
  it('короче 2 символов СДЭК не спрашиваем', () => {
    render(<Controlled onChange={vi.fn()} />)
    type('М')
    act(() => vi.advanceTimersByTime(400))
    expect(mockSuggest).not.toHaveBeenCalled()
  })

  it('спрашивает через 250 мс и показывает «Нальчик · Кабардино-Балкария»', async () => {
    render(<Controlled onChange={vi.fn()} />)
    type('На')
    act(() => vi.advanceTimersByTime(200))
    expect(mockSuggest).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(60))
    expect(mockSuggest).toHaveBeenCalledWith(
      'На',
      expect.objectContaining({ signal: expect.anything() }),
    )
    await flush()
    expect(screen.getByRole('option', { name: 'Нальчик · Кабардино-Балкария' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Москва' })).toBeInTheDocument()
  })

  it('новый ввод отменяет прошлый запрос, и его поздний ответ не показывается', async () => {
    let resolveFirst!: (cities: CdekCity[]) => void
    mockSuggest.mockImplementationOnce(
      () =>
        new Promise<CdekCity[]>((resolve) => {
          resolveFirst = resolve
        }),
    )
    mockSuggest.mockResolvedValueOnce([MOSCOW])
    render(<Controlled onChange={vi.fn()} />)

    type('Мо')
    act(() => vi.advanceTimersByTime(250))
    const firstSignal = mockSuggest.mock.calls[0]![1]!.signal!
    type('Моск')
    expect(firstSignal.aborted).toBe(true)
    act(() => vi.advanceTimersByTime(250))
    await flush()
    resolveFirst([NALCHIK])
    await flush()

    expect(screen.getByRole('option', { name: 'Москва' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Нальчик/ })).toBeNull()
  })

  it('клик выбирает город: наружу — город, в поле — название, под полем — полное имя', async () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    type('На')
    act(() => vi.advanceTimersByTime(250))
    await flush()
    fireEvent.click(screen.getByRole('option', { name: /Нальчик/ }))
    expect(onChange).toHaveBeenLastCalledWith(NALCHIK)
    expect(input()).toHaveValue('Нальчик')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByText(NALCHIK.fullName)).toBeInTheDocument()
  })

  it('стрелки и Enter выбирают город, Enter не отправляет форму', async () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    type('На')
    act(() => vi.advanceTimersByTime(250))
    await flush()
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    const options = screen.getAllByRole('option')
    expect(input()).toHaveAttribute('aria-activedescendant', options[1]!.id)
    // false — у события вызван preventDefault: браузер не отправит форму.
    expect(fireEvent.keyDown(input(), { key: 'Enter' })).toBe(false)
    expect(onChange).toHaveBeenLastCalledWith(NALCHIK)
  })

  it('ничего не найдено — Enter не отправляет форму', async () => {
    const onChange = vi.fn()
    mockSuggest.mockResolvedValueOnce([])
    render(<Controlled onChange={onChange} />)
    type('Абырвалг')
    act(() => vi.advanceTimersByTime(250))
    await flush()
    expect(screen.getByText('Город не найден — проверьте название')).toBeInTheDocument()
    // false — у события вызван preventDefault: браузер не отправит форму.
    expect(fireEvent.keyDown(input(), { key: 'Enter' })).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Enter сразу после нового ввода не выбирает город из старого списка', async () => {
    // Для «Новор…» СДЭК отдаёт только Новороссийск — если бы Enter схватил
    // город из ответа на «Нов», это был бы ещё Новосибирск.
    mockSuggest.mockImplementation(async (q: string) =>
      q.startsWith('Новор') ? [NOVOROS] : [NOVOSIB, NOVOROS],
    )
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    type('Нов')
    act(() => vi.advanceTimersByTime(250))
    await flush()
    expect(
      screen.getByRole('option', { name: 'Новосибирск · Новосибирская область' }),
    ).toBeInTheDocument()

    // Допечатываем и сразу жмём Enter — новый дебаунс ещё не сработал, на
    // экране старый список для «Нов», а не для «Новороссийск».
    fireEvent.change(input(), { target: { value: 'Новороссийск' } })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()

    // Дебаунс новой строки сработал — список свежий, и Enter снова выбирает.
    act(() => vi.advanceTimersByTime(250))
    await flush()
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith(NOVOROS)
  })

  it('Esc закрывает список', async () => {
    render(<Controlled onChange={vi.fn()} />)
    type('На')
    act(() => vi.advanceTimersByTime(250))
    await flush()
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('СДЭК не ответил — «Не удалось загрузить города» и «Повторить»', async () => {
    mockSuggest.mockRejectedValueOnce(new Error('502')).mockResolvedValueOnce([MOSCOW])
    render(<Controlled onChange={vi.fn()} />)
    type('Мо')
    act(() => vi.advanceTimersByTime(250))
    await flush()
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить города')
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    act(() => vi.advanceTimersByTime(250))
    await flush()
    expect(mockSuggest).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('option', { name: 'Москва' })).toBeInTheDocument()
  })

  it('город подставлен снаружи (прошлый визит) — в поле название, запросов нет', () => {
    render(<Controlled initial={MOSCOW} onChange={vi.fn()} />)
    expect(input()).toHaveValue('Москва')
    act(() => vi.advanceTimersByTime(400))
    expect(mockSuggest).not.toHaveBeenCalled()
  })

  it('правка текста выбранного города сбрасывает выбор, чтобы не остался старый пункт', () => {
    const onChange = vi.fn()
    render(<Controlled initial={MOSCOW} onChange={onChange} />)
    type('Мос')
    expect(onChange).toHaveBeenCalledWith(null)
    expect(input()).toHaveValue('Мос')
  })
})
