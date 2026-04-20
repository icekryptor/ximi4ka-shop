'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

// Combined search + sort control for the redirects list. Writes filters
// into the URL so the server component re-renders. Mirrors the pattern
// used by PagesListSearch but adds sort buttons.
const SORTS: Array<{ value: string; label: string }> = [
  { value: 'hits_desc', label: 'По хитам ↓' },
  { value: 'hits_asc', label: 'По хитам ↑' },
  { value: 'from_asc', label: 'По пути' },
]

export function RedirectsListControls({
  initialQuery,
  currentSort,
}: {
  initialQuery: string
  currentSort: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [value, setValue] = useState(initialQuery)
  const [pending, startTransition] = useTransition()

  function navigate(next: URLSearchParams) {
    next.delete('offset')
    startTransition(() => {
      router.push(
        `/admin/redirects${next.toString() ? `?${next.toString()}` : ''}`,
      )
    })
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const q = value.trim()
    const next = new URLSearchParams(params?.toString() ?? '')
    if (q) next.set('q', q)
    else next.delete('q')
    navigate(next)
  }

  function setSort(sort: string) {
    const next = new URLSearchParams(params?.toString() ?? '')
    if (sort === 'hits_desc') next.delete('sort')
    else next.set('sort', sort)
    navigate(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form onSubmit={submit} role="search" className="flex gap-2">
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Поиск по пути"
          className="input max-w-md"
          aria-label="Поиск редиректов"
        />
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded-full bg-brand text-white font-medium disabled:opacity-50"
        >
          {pending ? '...' : 'Найти'}
        </button>
        {initialQuery ? (
          <button
            type="button"
            onClick={() => {
              setValue('')
              const next = new URLSearchParams(params?.toString() ?? '')
              next.delete('q')
              navigate(next)
            }}
            className="px-4 py-2 rounded-full bg-brand-bg-soft text-brand-text"
          >
            Сбросить
          </button>
        ) : null}
      </form>
      <div className="flex gap-1" role="group" aria-label="Сортировка">
        {SORTS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setSort(s.value)}
            disabled={pending}
            aria-pressed={currentSort === s.value}
            className={
              'px-3 py-1.5 rounded-full text-sm font-medium disabled:opacity-50 ' +
              (currentSort === s.value
                ? 'bg-brand text-white'
                : 'bg-brand-bg-soft text-brand-text hover:bg-brand-bg-soft/80')
            }
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
