'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminUploadImage, ApiError } from '@/lib/adminApi'

// Hidden file input wired to a visible upload button. Posts through the
// existing admin upload endpoint; on success refreshes the server component
// so the new thumbnail appears in the grid.
export function MediaUploadButton() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        await adminUploadImage(file)
      }
      router.refresh()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось загрузить'
      setError(msg)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="px-4 py-2 rounded-full bg-brand text-white font-semibold hover:bg-brand-dark transition disabled:opacity-50"
      >
        {uploading ? 'Загрузка...' : 'Загрузить'}
      </button>
      {error ? (
        <div role="alert" className="text-xs text-red-600">
          {error}
        </div>
      ) : null}
    </div>
  )
}
