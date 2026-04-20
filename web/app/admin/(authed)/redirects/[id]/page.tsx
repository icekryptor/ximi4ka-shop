import { cookies } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import type { Redirect } from '@/lib/adminApi'
import { RedirectEditClient } from './RedirectEditClient'

async function fetchRedirect(id: string): Promise<Redirect | null> {
  const store = await cookies()
  const cookieHeader = store.toString()
  const res = await fetch(
    `${ADMIN_API_URL_SERVER}/api/admin/redirects/${encodeURIComponent(id)}`,
    {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Fetch redirect failed: ${res.status}`)
  const body = (await res.json()) as { data: Redirect }
  return body.data
}

export default async function EditRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const row = await fetchRedirect(id)
  if (!row) notFound()

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-text">
          Редирект: <span className="font-mono text-lg">{row.fromPath}</span>
        </h1>
        <Link
          href="/admin/redirects"
          className="text-sm text-brand-text-secondary hover:underline"
        >
          ← К списку
        </Link>
      </div>
      <RedirectEditClient initial={row} />
    </div>
  )
}
