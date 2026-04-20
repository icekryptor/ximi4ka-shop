'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminDeleteMedia, ApiError, type Media } from '@/lib/adminApi'
import { formatSize } from '@/components/admin/MediaPicker'

// Single media card for the library grid. Thumbnail + filename + dimensions +
// size + delete. Delete is destructive (hard delete + unlink on disk) and is
// intentionally not reference-checked — admins delete with care.
export function MediaCard({ media }: { media: Media }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    if (busy) return
    const ok = window.confirm(
      `Удалить файл «${media.filename}»? Это действие нельзя отменить.`,
    )
    if (!ok) return
    setBusy(true)
    try {
      await adminDeleteMedia(media.id)
      router.refresh()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Ошибка удаления'
      window.alert(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-brand-border overflow-hidden flex flex-col">
      <div className="aspect-square bg-brand-bg-soft flex items-center justify-center overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={toAbsolute(media.url)}
          alt={media.filename}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="p-2 flex-1 flex flex-col gap-1">
        <div
          className="text-xs text-brand-text truncate"
          title={media.filename}
        >
          {media.filename}
        </div>
        <div className="text-[11px] text-brand-text-secondary">
          {media.width && media.height
            ? `${media.width}×${media.height} • `
            : ''}
          {formatSize(media.size)}
        </div>
        <div className="mt-auto pt-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="text-xs text-red-600 hover:underline disabled:opacity-50"
          >
            {busy ? '...' : 'Удалить'}
          </button>
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
