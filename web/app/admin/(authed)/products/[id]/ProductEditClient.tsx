'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Product } from '@ximi4ka-shop/shared'
import { ProductForm } from '@/components/admin/ProductForm'
import {
  ApiError,
  adminDeleteProduct,
  adminPublishProduct,
  adminUnpublishProduct,
  adminUpdateProduct,
  type AdminProductInput,
} from '@/lib/adminApi'

interface Props {
  initial: Product
}

export function ProductEditClient({ initial }: Props) {
  const router = useRouter()
  const [product, setProduct] = useState<Product>(initial)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [publishBusy, setPublishBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  async function handleSubmit(input: AdminProductInput) {
    setSubmitting(true)
    setError(null)
    try {
      const updated = await adminUpdateProduct(product.id, input)
      setProduct(updated)
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError) setError(err)
      else setError(new ApiError(500, 'network_error', 'Ошибка сети'))
    } finally {
      setSubmitting(false)
    }
  }

  async function togglePublish() {
    if (publishBusy) return
    setPublishBusy(true)
    try {
      const next = product.isPublished
        ? await adminUnpublishProduct(product.id)
        : await adminPublishProduct(product.id)
      setProduct(next)
      router.refresh()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Ошибка'
      window.alert(msg)
    } finally {
      setPublishBusy(false)
    }
  }

  async function handleDelete() {
    if (deleteBusy) return
    const ok = window.confirm(
      `Удалить товар «${product.name}»? Это действие мягкое (soft-delete).`,
    )
    if (!ok) return
    setDeleteBusy(true)
    try {
      await adminDeleteProduct(product.id)
      router.push('/admin/products')
      router.refresh()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Ошибка удаления'
      window.alert(msg)
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 p-4 rounded-xl bg-white border border-brand-border">
        <PublishToggleButton
          isPublished={product.isPublished}
          onToggle={togglePublish}
          busy={publishBusy}
        />
        <DeleteButton onDelete={handleDelete} busy={deleteBusy} />
        <div className="ml-auto text-sm text-brand-text-secondary">
          ID: <span className="font-mono text-xs">{product.id}</span>
        </div>
      </div>
      <ProductForm
        mode="edit"
        initialValue={product}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
      />
    </>
  )
}

function PublishToggleButton({
  isPublished,
  onToggle,
  busy,
}: {
  isPublished: boolean
  onToggle: () => void
  busy: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      className={
        'px-4 py-2 rounded-full text-sm font-medium disabled:opacity-50 ' +
        (isPublished
          ? 'bg-brand-bg-soft text-brand-text'
          : 'bg-brand text-white')
      }
    >
      {busy ? '...' : isPublished ? 'Снять с публикации' : 'Опубликовать'}
    </button>
  )
}

function DeleteButton({
  onDelete,
  busy,
}: {
  onDelete: () => void
  busy: boolean
}) {
  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      className="px-4 py-2 rounded-full text-sm font-medium bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
    >
      {busy ? 'Удаление...' : 'Удалить'}
    </button>
  )
}
