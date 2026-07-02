'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { BlogPost } from '@ximi4ka-shop/shared'
import { BlogPostForm } from '@/components/admin/BlogPostForm'
import { RevisionsPanel } from '@/components/admin/RevisionsPanel'
import {
  ApiError,
  adminDeleteBlogPost,
  adminPublishBlogPost,
  adminUnpublishBlogPost,
  adminUpdateBlogPost,
  type AdminBlogPostInput,
} from '@/lib/adminApi'

interface Props {
  initial: BlogPost
}

export function BlogPostEditClient({ initial }: Props) {
  const router = useRouter()
  const [post, setPost] = useState<BlogPost>(initial)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [publishBusy, setPublishBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  async function handleSubmit(input: AdminBlogPostInput) {
    setSubmitting(true)
    setError(null)
    try {
      const updated = await adminUpdateBlogPost(post.id, input)
      setPost(updated)
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
      const next = post.isPublished
        ? await adminUnpublishBlogPost(post.id)
        : await adminPublishBlogPost(post.id)
      setPost(next)
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
      `Удалить статью «${post.title}»? Это действие мягкое (soft-delete).`,
    )
    if (!ok) return
    setDeleteBusy(true)
    try {
      await adminDeleteBlogPost(post.id)
      router.push('/admin/blog')
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
        <StatusBadge isPublished={post.isPublished} />
        <PublishToggleButton
          isPublished={post.isPublished}
          onToggle={togglePublish}
          busy={publishBusy}
        />
        <DeleteButton onDelete={handleDelete} busy={deleteBusy} />
        <div className="ml-auto text-sm text-brand-text-secondary">
          ID: <span className="font-mono text-xs">{post.id}</span>
        </div>
      </div>
      <BlogPostForm
        mode="edit"
        initialValue={post}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
      />
      <RevisionsPanel
        entityType="blog_post"
        entityId={post.id}
        onRestored={() => router.refresh()}
      />
    </>
  )
}

function StatusBadge({ isPublished }: { isPublished: boolean }) {
  return isPublished ? (
    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
      Опубликовано
    </span>
  ) : (
    <span className="text-xs bg-brand-bg-soft text-brand-text-secondary px-2 py-1 rounded-full font-medium">
      Черновик
    </span>
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
