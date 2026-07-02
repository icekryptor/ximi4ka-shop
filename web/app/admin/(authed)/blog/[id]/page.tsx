import { cookies } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { BlogPost } from '@ximi4ka-shop/shared'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { BlogPostEditClient } from './BlogPostEditClient'

async function fetchPost(id: string): Promise<BlogPost | null> {
  const store = await cookies()
  const cookieHeader = store.toString()
  const res = await fetch(
    `${ADMIN_API_URL_SERVER}/api/admin/blog/${encodeURIComponent(id)}`,
    {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Fetch blog post failed: ${res.status}`)
  const body = (await res.json()) as { data: BlogPost }
  return body.data
}

export default async function EditBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const post = await fetchPost(id)
  if (!post) notFound()

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-text">
          Редактирование: {post.title}
        </h1>
        <Link
          href="/admin/blog"
          className="text-sm text-brand-text-secondary hover:underline"
        >
          ← К списку
        </Link>
      </div>
      <BlogPostEditClient initial={post} />
    </div>
  )
}
