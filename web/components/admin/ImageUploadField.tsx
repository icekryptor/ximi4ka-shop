'use client'

import { useRef, useState } from 'react'
import { ApiError, adminUploadImage } from '@/lib/adminApi'

interface SingleProps {
  value: string | null
  onChange: (url: string | null) => void
  label?: string
  id?: string
}

// Single image slot. Used for og_image, card covers, etc.
export function ImageUploadField({ value, onChange, label, id }: SingleProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)

  async function handleFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return
    const file = files[0]
    setError(null)
    setUploading(true)
    try {
      const result = await adminUploadImage(file)
      onChange(result.url)
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Не удалось загрузить файл'
      setError(msg)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      {label ? (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-brand-text-secondary mb-1"
        >
          {label}
        </label>
      ) : null}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragActive(false)
          void handleFiles(e.dataTransfer.files)
        }}
        className={
          'rounded-2xl border-2 border-dashed p-4 flex items-center gap-4 transition ' +
          (dragActive
            ? 'border-brand bg-brand/5'
            : 'border-brand-border bg-white')
        }
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value.startsWith('http') ? value : toAbsolute(value)}
            alt=""
            className="w-24 h-24 object-cover rounded-lg border border-brand-border"
          />
        ) : (
          <div className="w-24 h-24 rounded-lg bg-brand-bg-soft flex items-center justify-center text-xs text-brand-text-secondary">
            Нет файла
          </div>
        )}
        <div className="flex-1 min-w-0">
          <input
            id={id}
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 rounded-full bg-brand text-white text-sm disabled:opacity-50"
            >
              {uploading ? 'Загрузка...' : value ? 'Заменить' : 'Выбрать файл'}
            </button>
            {value ? (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="px-3 py-1.5 rounded-full bg-brand-bg-soft text-brand-text text-sm"
              >
                Удалить
              </button>
            ) : null}
          </div>
          {value ? (
            <div className="mt-2 text-xs text-brand-text-secondary break-all">
              {value}
            </div>
          ) : (
            <div className="mt-2 text-xs text-brand-text-secondary">
              Перетащите сюда файл или выберите его. До 10 МБ.
            </div>
          )}
          {error ? (
            <div role="alert" className="mt-2 text-xs text-red-600">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

interface MultiValue {
  url: string
  alt: string
}

interface MultiProps {
  value: MultiValue[]
  onChange: (next: MultiValue[]) => void
  label?: string
}

// Gallery of images for product.images[]. Alt text inline editable.
export function MultiImageUploadField({ value, onChange, label }: MultiProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      const uploaded: MultiValue[] = []
      for (const file of Array.from(files)) {
        const result = await adminUploadImage(file)
        uploaded.push({ url: result.url, alt: '' })
      }
      onChange([...value, ...uploaded])
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Не удалось загрузить файл'
      setError(msg)
    } finally {
      setUploading(false)
    }
  }

  function removeAt(i: number) {
    onChange(value.filter((_, idx) => idx !== i))
  }

  function setAlt(i: number, alt: string) {
    onChange(value.map((v, idx) => (idx === i ? { ...v, alt } : v)))
  }

  return (
    <div>
      {label ? (
        <div className="block text-sm font-medium text-brand-text-secondary mb-1">
          {label}
        </div>
      ) : null}
      <div className="space-y-3">
        {value.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-3 bg-white border border-brand-border rounded-xl p-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url.startsWith('http') ? item.url : toAbsolute(item.url)}
              alt=""
              className="w-16 h-16 object-cover rounded-lg"
            />
            <input
              type="text"
              value={item.alt}
              onChange={(e) => setAlt(i, e.target.value)}
              placeholder="Alt текст"
              className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-brand-border focus:outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="text-sm text-red-600 hover:underline"
            >
              Удалить
            </button>
          </div>
        ))}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <div className="mt-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="px-3 py-1.5 rounded-full bg-brand text-white text-sm disabled:opacity-50"
        >
          {uploading ? 'Загрузка...' : 'Добавить изображения'}
        </button>
      </div>
      {error ? (
        <div role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </div>
      ) : null}
    </div>
  )
}

function toAbsolute(url: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
  return `${base}${url}`
}
