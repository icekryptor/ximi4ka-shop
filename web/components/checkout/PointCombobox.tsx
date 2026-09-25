'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import type { CdekPoint } from '@ximi4ka-shop/shared'
import { searchPoints } from '@/lib/cdekPoints'
import {
  ERROR_CLASS,
  FIELD_CLASS,
  HINT_CLASS,
  LABEL_CLASS,
  LISTBOX_CLASS,
  optionClass,
} from './fieldStyles'

interface Props {
  id: string
  points: CdekPoint[]
  value: CdekPoint | null
  onChange: (point: CdekPoint) => void
  error?: string
}

// «MSK310 · пр-т Мира, 108» — как строка списка у Тильды.
export function pointLabel(point: Pick<CdekPoint, 'code' | 'address'>): string {
  return point.address ? `${point.code} · ${point.address}` : point.code
}

// «Пункт получения» — список ПВЗ города с поиском по словам (спека §5.1, п. 3).
// Пока список закрыт, в поле — выбранный пункт; при фокусе поле пустеет под
// запрос, а выбранный пункт остаётся в подсказке.
export function PointCombobox({ id, points, value, onChange, error }: Props) {
  const listboxId = useId()
  const optionIdBase = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)

  const { matches, total } = useMemo(() => searchPoints(points, query), [points, query])
  const optionId = (i: number) => `${optionIdBase}-point-${i}`

  // Выделенная стрелками строка не уходит из видимой части списка.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    document
      .getElementById(`${optionIdBase}-point-${activeIndex}`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [open, activeIndex, optionIdBase])

  function close() {
    setOpen(false)
    setQuery('')
    setActiveIndex(-1)
  }

  function choose(point: CdekPoint) {
    close()
    onChange(point)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      close()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      // Стрелка на закрытом поле открывает список, как у select.
      if (!open) {
        setOpen(true)
        return
      }
      if (matches.length === 0) return
      const down = e.key === 'ArrowDown'
      setActiveIndex((i) => (down ? (i + 1) % matches.length : i <= 0 ? matches.length - 1 : i - 1))
      return
    }
    if (e.key === 'Enter' && open) {
      // Enter выбирает пункт, а не отправляет форму заказа.
      e.preventDefault()
      if (activeIndex >= 0 && activeIndex < matches.length) choose(matches[activeIndex]!)
      else if (matches.length === 1) choose(matches[0]!)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={LABEL_CLASS}>
        Пункт получения *
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          placeholder={value ? pointLabel(value) : 'Код пункта или часть адреса'}
          value={open ? query : value ? pointLabel(value) : ''}
          onFocus={() => setOpen(true)}
          onBlur={close}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
          onKeyDown={onKeyDown}
          className={FIELD_CLASS}
        />
        {open && (
          <div className={LISTBOX_CLASS}>
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Пункты выдачи"
              className="m-0 list-none p-0"
            >
              {matches.map((p, i) => (
                <li
                  key={p.code}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === activeIndex}
                  // Клик не уводит фокус из поля: onBlur закрыл бы список раньше выбора.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(p)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={optionClass(i === activeIndex)}
                >
                  <span>{pointLabel(p)}</span>
                  {p.workTime && <span className={HINT_CLASS}>{p.workTime}</span>}
                </li>
              ))}
            </ul>
            {total === 0 && (
              <p className={`${HINT_CLASS} px-3 py-3`}>
                Ничего не найдено — попробуйте часть адреса или код пункта
              </p>
            )}
            {total > matches.length && (
              <p className={`${HINT_CLASS} px-3 py-2`}>
                Показаны {matches.length} из {total} — уточните запрос
              </p>
            )}
          </div>
        )}
      </div>
      {error && <p className={ERROR_CLASS}>{error}</p>}
    </div>
  )
}
