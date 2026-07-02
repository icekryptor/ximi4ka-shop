'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ApiError,
  adminListRevisions,
  adminRestoreRevision,
  type RevisionEntityType,
  type RevisionSummary,
} from '@/lib/adminApi'

interface Props {
  entityType: RevisionEntityType
  entityId: string
  onRestored?: () => void
}

// Collapsible panel listing the change history for a given entity. Lazy-loads
// on mount (cheap query, and admins nearly always want it open when editing).
// Each row shows the editor's email + timestamp and has a "Восстановить"
// button that reverts the entity to that snapshot after a confirm.
export function RevisionsPanel({ entityType, entityId, onRestored }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<RevisionSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminListRevisions(entityType, entityId, { limit: 50 })
      setItems(res.data)
      setTotal(res.pagination.total)
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Не удалось загрузить историю'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [entityType, entityId])

  useEffect(() => {
    // Deferred via queueMicrotask so the setState calls inside `load` land in
    // a separate render pass — same pattern MediaPicker uses to satisfy
    // react-hooks/set-state-in-effect.
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void load()
    })
    return () => {
      cancelled = true
    }
  }, [load])

  async function handleRestore(rev: RevisionSummary) {
    if (restoringId) return
    const when = formatDateTime(rev.editedAt)
    const ok = window.confirm(
      `Восстановить версию от ${when}? Текущее состояние будет сохранено в истории.`,
    )
    if (!ok) return
    setRestoringId(rev.id)
    try {
      await adminRestoreRevision(rev.id)
      await load()
      onRestored?.()
      router.refresh()
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Ошибка восстановления'
      window.alert(msg)
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <details className="rounded-xl bg-white border border-brand-border">
      <summary className="cursor-pointer select-none px-4 py-3 font-medium text-brand-text">
        История изменений ({total})
      </summary>
      <div className="px-4 pb-4 pt-1">
        {loading ? (
          <div className="text-sm text-brand-text-secondary">Загрузка…</div>
        ) : error ? (
          <div className="text-sm text-red-700" role="alert">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="text-sm text-brand-text-secondary">
            Пока нет изменений
          </div>
        ) : (
          <ul className="divide-y divide-brand-border">
            {items.map((r) => (
              <li
                key={r.id}
                className="py-2 flex items-center gap-3 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-brand-text">{formatDateTime(r.editedAt)}</div>
                  <div className="text-brand-text-secondary truncate">
                    {r.editorEmail ?? '—'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestore(r)}
                  disabled={restoringId !== null}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-brand-bg-soft text-brand-text hover:bg-brand/10 disabled:opacity-50"
                >
                  {restoringId === r.id ? 'Восстановление…' : 'Восстановить'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}

function formatDateTime(iso: string): string {
  // Russian-locale formatting. Using toLocaleString keeps it consistent with
  // whatever the browser reports to the admin.
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
