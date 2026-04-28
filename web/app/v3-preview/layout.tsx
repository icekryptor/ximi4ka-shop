import type { Metadata } from 'next'

// Chromeless layout for the v3 preview route. The root layout (web/app/layout.tsx)
// only mounts <html>/<body> shell — public Header/Footer live under
// app/[locale]/(public)/layout.tsx which we deliberately bypass here. Returning
// just {children} keeps the v3 hero standing alone with no nav, footer, or
// cart drawer leaking in.
//
// noindex/nofollow because this is an evaluation-only showcase and must not
// surface in search.

export const metadata: Metadata = {
  title: 'v3 Preview — Ximi4ka',
  description: 'v3 design direction preview',
  robots: { index: false, follow: false },
}

export default function V3PreviewLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
