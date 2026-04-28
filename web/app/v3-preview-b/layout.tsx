import type { Metadata } from 'next'

// Chromeless layout for the v3 Preview B route — Direction B (saturated,
// illustrated, kinetic / Tinkoff Junior vibe). Mirrors /v3-preview/layout.tsx
// in shape: bypasses the public Header/Footer that live under
// app/[locale]/(public)/layout.tsx so the alt-direction hero stands alone for
// side-by-side A/B evaluation.
//
// noindex/nofollow — evaluation-only, must not surface in search.

export const metadata: Metadata = {
  title: 'v3 Preview B — Ximi4ka',
  description: 'v3 Direction B — saturated illustrated',
  robots: { index: false, follow: false },
}

export default function V3PreviewBLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
