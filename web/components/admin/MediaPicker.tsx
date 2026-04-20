'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { adminListMedia, ApiError, type Media } from '@/lib/adminApi'

interface Props {
  open: boolean
  onClose: () => void
  onPick: (url: string) => void
  mimePrefix?: string
}

const PAGE_SIZE = 40

// Reusable media-browser modal. Fetches lazily — only when `open` goes true —
// and supports "show more" pagination in place (append, not replace).
// Self-contained: owns its own data fetching via adminListMedia.
export function MediaPicker({
  open,
  onClose,
  onPick,
  mimePrefix = 'image/',
}: Props) {
  const [items, setItems] = useState<Media[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  // Controlled search value. Persists across open/close so re-opening the
  // picker keeps the admin's last query — same UX as a normal list.
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(
    async (nextOffset: number, search: string, append: boolean) => {
      setLoading(true)
      setError(null)
      try {
        const res = await adminListMedia({
          limit: PAGE_SIZE,
          offset: nextOffset,
          q: search || undefined,
          mimePrefix,
        })
        setTotal(res.pagination.total)
        setOffset(nextOffset)
        setItems((prev) => (append ? [...prev, ...res.data] : res.data))
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message : 'Не удалось загрузить медиа'
        setError(msg)
      } finally {
        setLoading(false)
      }
    },
    [mimePrefix],
  )

  useEffect(() => {
    if (!open) return
    // Fetch page 0 whenever the modal opens. Deferred to a microtask so the
    // setState inside `load` lands in a separate render pass — avoids the
    // cascading-render warning from react-hooks/set-state-in-effect. We use
    // the current `q` so a re-open with a prior search still filters.
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void load(0, q, false)
    })
    return () => {
      cancelled = true
    }
    // We intentionally omit `q` from deps: we only want this to fire on the
    // open transition, not on every keystroke — the search button explicitly
    // triggers load() on submit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, load])

  if (!open) return null

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    void load(0, q.trim(), false)
  }

  function handleShowMore() {
    if (loading) return
    void load(offset + PAGE_SIZE, q.trim(), true)
  }

  const hasMore = offset + PAGE_SIZE < total

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Библиотека медиа"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => {
        // Backdrop click closes; clicks inside dialog don't bubble.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-brand-border">
          <h2 className="text-lg font-semibold text-brand-text">
            Выберите из библиотеки
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-full bg-brand-bg-soft text-brand-text text-sm"
          >
            Отмена
          </button>
        </div>

        <form
          onSubmit={submitSearch}
          role="search"
          className="px-5 py-3 flex gap-2 border-b border-brand-border"
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по имени файла"
            aria-label="Поиск в библиотеке"
            className="input flex-1"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-full bg-brand text-white font-medium disabled:opacity-50"
          >
            Найти
          </button>
        </form>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <div role="alert" className="text-sm text-red-600 mb-3">
              {error}
            </div>
          ) : null}
          {items.length === 0 && !loading ? (
            <div className="text-center text-brand-text-secondary py-12">
              Ничего не найдено.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {items.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onPick(m.url)
                    onClose()
                  }}
                  className="group text-left bg-white rounded-xl border border-brand-border hover:border-brand overflow-hidden transition"
                >
                  <div className="aspect-square bg-brand-bg-soft flex items-center justify-center overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={toAbsolute(m.url)}
                      alt={m.filename}
                      className="w-full h-full object-cover group-hover:scale-105 transition"
                    />
                  </div>
                  <div className="p-2">
                    <div
                      className="text-xs text-brand-text truncate"
                      title={m.filename}
                    >
                      {m.filename}
                    </div>
                    <div className="text-[11px] text-brand-text-secondary">
                      {m.width && m.height ? `${m.width}×${m.height} • ` : ''}
                      {formatSize(m.size)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-brand-border flex items-center justify-between text-sm text-brand-text-secondary">
          <div>
            Всего: {total}
            {items.length > 0 ? ` · показано ${items.length}` : ''}
          </div>
          <div className="flex gap-2">
            {hasMore ? (
              <button
                type="button"
                onClick={handleShowMore}
                disabled={loading}
                className="px-3 py-1.5 rounded-full bg-white border border-brand-border hover:bg-brand-bg-soft disabled:opacity-50"
              >
                {loading ? '...' : 'Показать ещё'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function toAbsolute(url: string): string {
  if (url.startsWith('http')) return url
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
  return `${base}${url}`
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} КБ`
  }
  const mb = bytes / (1024 * 1024)
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} МБ`
}
