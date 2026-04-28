import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'v3 Preview E — Ximi4ka',
  description: 'v3 final synthesis — Lab-Tech + RU marketplace + zebra rhythm',
  robots: { index: false, follow: false },
}

export default function V3PreviewELayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
