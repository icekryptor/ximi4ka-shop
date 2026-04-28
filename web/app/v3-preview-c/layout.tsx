import type { Metadata } from 'next'

// Chromeless layout for the v3 Preview C route — Direction C (Lab-Tech /
// Acid). Mirrors /v3-preview/layout.tsx and /v3-preview-b/layout.tsx in
// shape: bypasses the public Header/Footer that live under
// app/[locale]/(public)/layout.tsx so the alt-direction hero stands alone
// for side-by-side A/B/C evaluation.
//
// noindex/nofollow — evaluation-only, must not surface in search.

export const metadata: Metadata = {
  title: 'v3 Preview C — Ximi4ka',
  description: 'v3 Direction C — Lab-Tech',
  robots: { index: false, follow: false },
}

export default function V3PreviewCLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
