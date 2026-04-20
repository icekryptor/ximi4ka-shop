import { cookies } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Page } from '@ximi4ka-shop/shared'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import { PageEditClient } from './PageEditClient'

async function fetchPage(id: string): Promise<Page | null> {
  const store = await cookies()
  const cookieHeader = store.toString()
  const res = await fetch(
    `${ADMIN_API_URL_SERVER}/api/admin/pages/${encodeURIComponent(id)}`,
    {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Fetch page failed: ${res.status}`)
  const body = (await res.json()) as { data: Page }
  return body.data
}

export default async function EditPagePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const page = await fetchPage(id)
  if (!page) notFound()

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-text">
          Редактирование: {page.title}
        </h1>
        <Link
          href="/admin/pages"
          className="text-sm text-brand-text-secondary hover:underline"
        >
          ← К списку
        </Link>
      </div>
      <PageEditClient initial={page} />
    </div>
  )
}
