'use client'

import { useEffect, useId, useState } from 'react'
import type { CdekCity } from '@ximi4ka-shop/shared'
import { suggestCdekCities } from '@/lib/api'
import { cityRegion } from '@/lib/cdekPoints'
import {
  ERROR_CLASS,
  FIELD_CLASS,
  HINT_CLASS,
  LABEL_CLASS,
  LISTBOX_CLASS,
  optionClass,
} from './fieldStyles'

const DEBOUNCE_MS = 250
const MIN_QUERY = 2

type Status = 'idle' | 'loading' | 'ready' | 'error'

interface Props {
  id: string
  value: CdekCity | null
  onChange: (city: CdekCity | null) => void
  error?: string
}

// «Нальчик · Кабардино-Балкария»; у Москвы региона нет — просто «Москва».
function cityLine(city: CdekCity): string {
  const region = cityRegion(city.fullName)
  return region ? `${city.name} · ${region}` : city.name
}

// Поле «Город» с подсказками СДЭК (спека §5.1, п. 1): от 2 символов, задержка
// 250 мс, прошлый запрос отменяется. Разметка — как у HeaderSearch, но
// role="combobox" стоит на самом поле (ARIA 1.2): так у него есть подпись.
export function CityCombobox({ id, value, onChange, error }: Props) {
  const listboxId = useId()
  const optionIdBase = useId()
  const [query, setQuery] = useState(value?.name ?? '')
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [cities, setCities] = useState<CdekCity[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [attempt, setAttempt] = useState(0)
  // Для какого города в поле сейчас текст. Родитель может подставить город сам
  // (сохранённый с прошлого визита) — тогда текст догоняет его.
  const [shownFor, setShownFor] = useState<CdekCity | null>(value)
  if (value !== shownFor) {
    setShownFor(value)
    setQuery(value?.name ?? '')
  }

  const q = query.trim()
  // Подсказки нужны, только пока город не выбран.
  const searching = value === null && q.length >= MIN_QUERY

  useEffect(() => {
    if (!searching) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      suggestCdekCities(q, { signal: controller.signal })
        .then((found) => {
          if (controller.signal.aborted) return
          setCities(found)
          setActiveIndex(-1)
          setStatus('ready')
        })
        .catch(() => {
          if (!controller.signal.aborted) setStatus('error')
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q, searching, attempt])

  // Пока идёт новый запрос, прежние подсказки остаются на месте — список не
  // мигает на каждой букве.
  const listOpen =
    open && searching && status !== 'error' && (status === 'ready' || cities.length > 0)
  const optionId = (i: number) => `${optionIdBase}-city-${i}`

  function handleInput(next: string) {
    const searchable = next.trim().length >= MIN_QUERY
    setQuery(next)
    setOpen(true)
    setActiveIndex(-1)
    setStatus(searchable ? 'loading' : 'idle')
    if (!searchable) setCities([])
    if (value !== null) {
      // Покупатель правит выбранный город — прежний выбор (и пункт в нём)
      // больше не верен.
      setShownFor(null)
      onChange(null)
    }
  }

  function choose(city: CdekCity) {
    setShownFor(city)
    setQuery(city.name)
    setOpen(false)
    setActiveIndex(-1)
    onChange(city)
  }

  function retry() {
    setStatus('loading')
    setOpen(true)
    setAttempt((n) => n + 1)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (e.key === 'Enter' && (searching || listOpen)) {
      // Пока идёт поиск или показан список — даже «Город не найден» без
      // единой подсказки — Enter не должен уходить дальше и отправлять форму
      // заказа. Ниже, если пункт выбирать нечем, просто выходим.
      e.preventDefault()
    }
    if (!listOpen || cities.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % cities.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? cities.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      // Без выделенной строки Enter выбирает первую — но только когда список
      // точно свежий (status === 'ready'). Пока идёт новый запрос, старые
      // подсказки остаются на экране (см. комментарий у listOpen), и без
      // этой проверки Enter выбрал бы город из прошлого, а не текущего ввода.
      if (activeIndex >= 0) {
        choose(cities[activeIndex]!)
      } else if (status === 'ready') {
        choose(cities[0]!)
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={LABEL_CLASS}>
        Город *
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={listOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          placeholder="Начните вводить название"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className={FIELD_CLASS}
        />
        {listOpen && (
          <ul id={listboxId} role="listbox" aria-label="Города" className={LISTBOX_CLASS}>
            {cities.length === 0 ? (
              <li
                role="option"
                aria-disabled="true"
                aria-selected="false"
                className={`${HINT_CLASS} px-3 py-3`}
              >
                Город не найден — проверьте название
              </li>
            ) : (
              cities.map((city, i) => (
                <li
                  key={city.code}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === activeIndex}
                  // Клик не должен уводить фокус из поля: onBlur закрыл бы
                  // список раньше, чем сработает выбор.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(city)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={optionClass(i === activeIndex)}
                >
                  {cityLine(city)}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      {value && <p className={HINT_CLASS}>{value.fullName}</p>}
      {searching && status === 'loading' && cities.length === 0 && (
        <p role="status" className={HINT_CLASS}>
          Ищем город…
        </p>
      )}
      {searching && status === 'error' && (
        <p role="alert" className={ERROR_CLASS}>
          Не удалось загрузить города{' '}
          <button type="button" onClick={retry} className="underline">
            Повторить
          </button>
        </p>
      )}
      {error && <p className={ERROR_CLASS}>{error}</p>}
    </div>
  )
}
