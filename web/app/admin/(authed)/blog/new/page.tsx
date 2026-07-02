'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { BlogPostForm } from '@/components/admin/BlogPostForm'
import {
  ApiError,
  adminCreateBlogPost,
  type AdminBlogPostInput,
} from '@/lib/adminApi'

export default function NewBlogPostPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  async function handleSubmit(input: AdminBlogPostInput) {
    setSubmitting(true)
    setError(null)
    try {
      const created = await adminCreateBlogPost(input)
      router.push(`/admin/blog/${created.id}`)
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError) setError(err)
      else setError(new ApiError(500, 'network_error', 'Ошибка сети'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-text">Новая статья</h1>
        <Link
          href="/admin/blog"
          className="text-sm text-brand-text-secondary hover:underline"
        >
          ← К списку
        </Link>
      </div>
      <BlogPostForm
        mode="create"
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
      />
    </div>
  )
}
