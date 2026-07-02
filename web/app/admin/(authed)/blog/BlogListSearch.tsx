'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

// Search input for the blog list. Writes the query into the URL so the
// server component re-runs and the result is a proper page render.
// Mirrors PagesListSearch, but points at /admin/blog.
export function BlogListSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [value, setValue] = useState(initialQuery)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const q = value.trim()
    const next = new URLSearchParams(params?.toString() ?? '')
    if (q) next.set('q', q)
    else next.delete('q')
    next.delete('offset')
    startTransition(() => {
      router.push(
        `/admin/blog${next.toString() ? `?${next.toString()}` : ''}`,
      )
    })
  }

  return (
    <form onSubmit={submit} role="search" className="flex gap-2">
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Поиск по заголовку или slug"
        className="input max-w-md"
        aria-label="Поиск статей"
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
            startTransition(() => {
              router.push('/admin/blog')
            })
          }}
          className="px-4 py-2 rounded-full bg-brand-bg-soft text-brand-text"
        >
          Сбросить
        </button>
      ) : null}
    </form>
  )
}
