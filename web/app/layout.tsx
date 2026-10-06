import type { Metadata } from 'next'
import './globals.css'
import { fontVariables } from './fonts'
import { getPublicSettings, type PublicSettings } from '@/lib/api'
import { MetrikaScript, Ga4Script, VkPixelScript } from '@/lib/analytics'
import { DEFAULT_SITE_DESCRIPTION, siteUrl } from '@/lib/metadata'

export const metadata: Metadata = {
  // Относительные og/twitter-картинки разрешаются от адреса сайта.
  metadataBase: new URL(siteUrl()),
  title: 'Химичка — наборы для химических экспериментов',
  description: DEFAULT_SITE_DESCRIPTION,
}

// Public settings live in the DB and are admin-editable. Failures here must
// not break the page — a down API or missing row just means no analytics
// scripts and no verification meta tags are emitted. The public endpoint is
// cached 60s server-side, so even one fetch per request per-node is cheap.
async function loadPublicSettings(): Promise<PublicSettings | null> {
  try {
    return await getPublicSettings()
  } catch {
    return null
  }
}

// Root layout mounts only the html/body shell. Public chrome (Header, Footer,
// CartDrawer) lives in app/(public)/layout.tsx; admin chrome lives in
// app/admin/(authed)/layout.tsx. Neither leaks into the other.
//
// Analytics and SEO verification tags are rendered here (not in the public
// layout) so they also apply to routes outside /(public) — e.g. server route
// handlers and any future top-level pages.
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const settings = await loadPublicSettings()
  return (
    <html lang="ru" className={`${fontVariables} h-full antialiased`}>
      <head>
        {/* Подтверждение сайта в Яндекс Мерчантах (merchants.yandex.ru). Не зависит от БД. */}
        <meta name="yandex-verification" content="02c1ec697bf7da58" />
        {settings?.yandexWebmasterVerification ? (
          <meta name="yandex-verification" content={settings.yandexWebmasterVerification} />
        ) : null}
        {settings?.googleSiteVerification ? (
          <meta name="google-site-verification" content={settings.googleSiteVerification} />
        ) : null}
      </head>
      <body className="min-h-screen flex flex-col text-brand-text bg-background">
        {children}
        {settings?.metrikaId ? <MetrikaScript counterId={settings.metrikaId} /> : null}
        {settings?.ga4Id ? <Ga4Script measurementId={settings.ga4Id} /> : null}
        <VkPixelScript />
      </body>
    </html>
  )
}
