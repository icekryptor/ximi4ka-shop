import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { AdminShell } from '@/components/admin/AdminShell'
import { ADMIN_API_URL_SERVER, type AdminUserPublic } from '@/lib/adminAuth'

// Server-side session check. Called on every request to any /admin/(authed)
// route. `cache: 'no-store'` is load-bearing — a stale cached 401 here would
// bounce a just-logged-in user back to /admin/login.
async function fetchCurrentAdmin(): Promise<AdminUserPublic | null> {
  const store = await cookies()
  const cookieHeader = store.toString()
  if (!cookieHeader) return null
  try {
    const res = await fetch(`${ADMIN_API_URL_SERVER}/api/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const body = (await res.json()) as { data: AdminUserPublic }
    return body.data
  } catch {
    return null
  }
}

export default async function AuthedAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const admin = await fetchCurrentAdmin()
  if (!admin) {
    redirect('/admin/login')
  }
  return <AdminShell admin={admin}>{children}</AdminShell>
}
