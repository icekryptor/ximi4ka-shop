import type { Metadata } from 'next'

// Chromeless layout for the v3 Preview D route — Direction D (Lab-Tech +
// cinematic product hero, iyO/drinksom hybrid). Mirrors
// /v3-preview-c/layout.tsx in shape: bypasses the public Header/Footer
// that live under app/[locale]/(public)/layout.tsx so the alt-direction
// hero stands alone for side-by-side A/B/C/D evaluation.
//
// noindex/nofollow — evaluation-only, must not surface in search.

export const metadata: Metadata = {
  title: 'v3 Preview D — Ximi4ka',
  description: 'v3 Direction D — Lab-Tech + cinematic product hero',
  robots: { index: false, follow: false },
}

export default function V3PreviewDLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
