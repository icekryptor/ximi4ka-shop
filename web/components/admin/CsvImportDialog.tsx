'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ApiError,
  adminImportRedirectsCsv,
  type RedirectCsvSummary,
} from '@/lib/adminApi'

interface Props {
  open: boolean
  onClose: () => void
}

// Modal for bulk-importing redirects from CSV. Two phases:
//   1. File not yet selected OR uploading: show file input + help text.
//   2. Upload complete: show summary {inserted, updated, skipped, errors}
//      and offer to close (which also triggers router.refresh() so the
//      new rows show up in the underlying table without a manual reload).
export function CsvImportDialog({ open, onClose }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<RedirectCsvSummary | null>(null)

  if (!open) return null

  async function handleFile(file: File) {
    setBusy(true)
    setError(null)
    setSummary(null)
    try {
      const result = await adminImportRedirectsCsv(file)
      setSummary(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка импорта')
    } finally {
      setBusy(false)
    }
  }

  function close() {
    setSummary(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
    onClose()
    router.refresh()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Импорт редиректов из CSV"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="bg-white rounded-2xl border border-brand-border w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-text">
            Импорт редиректов (CSV)
          </h2>
          <button
            type="button"
            onClick={close}
            className="text-brand-text-secondary hover:text-brand-text"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        {summary ? (
          <SummaryView summary={summary} />
        ) : (
          <UploadView
            busy={busy}
            error={error}
            inputRef={inputRef}
            onFile={handleFile}
          />
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={close}
            className="px-4 py-2 rounded-full bg-brand-bg-soft text-brand-text"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

function UploadView({
  busy,
  error,
  inputRef,
  onFile,
}: {
  busy: boolean
  error: string | null
  inputRef: React.RefObject<HTMLInputElement | null>
  onFile: (file: File) => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-brand-text-secondary">
        Загрузите CSV-файл с колонками{' '}
        <code className="text-xs bg-brand-bg-soft px-1 rounded">
          from_path,to_path,status_code
        </code>
        . Столбец <code>status_code</code> необязателен и по умолчанию 301.
        Существующие записи обновляются по <code>from_path</code>; счётчик хитов сохраняется.
      </p>
      <label
        htmlFor="csv-file"
        className="block rounded-2xl border-2 border-dashed border-brand-border p-6 text-center cursor-pointer hover:bg-brand-bg-soft"
      >
        <div className="text-sm font-medium text-brand-text">
          {busy ? 'Загрузка…' : 'Выберите CSV-файл'}
        </div>
        <div className="text-xs text-brand-text-secondary mt-1">
          До 5 МБ, UTF-8.
        </div>
        <input
          id="csv-file"
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
          }}
          className="sr-only"
        />
      </label>
      {error ? (
        <div role="alert" className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      ) : null}
    </div>
  )
}

function SummaryView({ summary }: { summary: RedirectCsvSummary }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Добавлено" value={summary.inserted} color="text-green-700" />
        <Stat label="Обновлено" value={summary.updated} color="text-brand" />
        <Stat label="Пропущено" value={summary.skipped} color="text-red-700" />
      </div>
      {summary.errors.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-brand-text mb-2">
            Ошибки ({summary.errors.length}):
          </h3>
          <ul className="max-h-60 overflow-y-auto text-xs space-y-1 border border-brand-border rounded-xl p-3 bg-brand-bg-soft">
            {summary.errors.map((e, idx) => (
              <li key={idx} className="text-red-700">
                Строка {e.row}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="text-sm text-brand-text-secondary">Ошибок нет.</div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div className="p-3 rounded-xl bg-brand-bg-soft">
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      <div className="text-xs text-brand-text-secondary">{label}</div>
    </div>
  )
}
