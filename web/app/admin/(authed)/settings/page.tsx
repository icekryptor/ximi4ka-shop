import { cookies } from 'next/headers'
import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'
import type { SiteSettings } from '@/lib/adminApi'
import { SettingsForm } from '@/components/admin/SettingsForm'

// Server-side fetch of the current settings singleton. `cache: 'no-store' ` so
// the admin always sees fresh values — this page is rarely loaded, and stale
// reads here would confuse an admin who just saved a change from another tab.
async function fetchSettings(): Promise<SiteSettings> {
  const store = await cookies()
  const cookieHeader = store.toString()
  const res = await fetch(`${ADMIN_API_URL_SERVER}/api/admin/settings`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Fetch settings failed: ${res.status}`)
  }
  const body = (await res.json()) as { data: SiteSettings }
  return body.data
}

export default async function AdminSettingsPage() {
  const settings = await fetchSettings()
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-brand-text">Настройки сайта</h1>
        <p className="text-sm text-brand-text-secondary">
          Аналитика, SEO, YML-фид и оплата. Изменения вступают в силу после
          сохранения.
        </p>
      </header>
      <SettingsForm initial={settings} />
    </div>
  )
}
