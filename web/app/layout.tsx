import type { Metadata } from 'next'
import { IBM_Plex_Sans, Roboto_Mono, JetBrains_Mono, Unbounded, Inter } from 'next/font/google'
import './globals.css'
import { getPublicSettings, type PublicSettings } from '@/lib/api'
import { MetrikaScript, Ga4Script } from '@/lib/analytics'

const plexSans = IBM_Plex_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex',
  display: 'swap',
})

// Roboto Mono — Tailwind's `font-mono`: globals.css maps @theme `--font-mono`
// to this variable, so it has to live in the root layout.
const robotoMono = Roboto_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '700'],
  variable: '--font-mono-google',
  display: 'swap',
})

// === v3 — Лабораторный Журнал font pair (Task 0.2) ===
// Unbounded + Inter + JetBrains Mono drive the lj typography scale wired up in
// globals.css's @theme inline `--font-lj-*` tokens. Old Mazzard / Plex / Roboto
// Mono setups above stay until Stage 6 cleanup so v2 surfaces keep rendering
// while v3 components migrate.
const ljDisplay = Unbounded({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '700', '900'],
  variable: '--font-lj-display',
  display: 'swap',
})

const ljBody = Inter({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500', '700'],
  variable: '--font-lj-body',
  display: 'swap',
})

// 600 is not in the lj type scale, but pages do render JetBrains Mono at 600:
// until 09.2026 a second JetBrains_Mono instance for /v3-preview-c shipped the
// 600 face under the same family name, and the lj surfaces picked it up.
const ljMono = JetBrains_Mono({
  subsets: ['cyrillic', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-lj-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Ximi4ka — наборы для химических экспериментов',
  description:
    'Химические наборы для детей и подростков. Научные эксперименты дома.',
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
    <html lang="ru" className={`${plexSans.variable} ${robotoMono.variable} ${ljDisplay.variable} ${ljBody.variable} ${ljMono.variable} h-full antialiased`}>
      <head>
        {settings?.yandexWebmasterVerification ? (
          <meta
            name="yandex-verification"
            content={settings.yandexWebmasterVerification}
          />
        ) : null}
        {settings?.googleSiteVerification ? (
          <meta
            name="google-site-verification"
            content={settings.googleSiteVerification}
          />
        ) : null}
      </head>
      <body className="min-h-screen flex flex-col text-brand-text bg-background">
        {children}
        {settings?.metrikaId ? (
          <MetrikaScript counterId={settings.metrikaId} />
        ) : null}
        {settings?.ga4Id ? <Ga4Script measurementId={settings.ga4Id} /> : null}
      </body>
    </html>
  )
}
