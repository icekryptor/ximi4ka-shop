import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ximi4ka — наборы для химических экспериментов',
  description:
    'Химические наборы для детей и подростков. Научные эксперименты дома.',
}

// Root layout mounts only the html/body shell. Public chrome (Header, Footer,
// CartDrawer) lives in app/(public)/layout.tsx; admin chrome lives in
// app/admin/(authed)/layout.tsx. Neither leaks into the other.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-screen flex flex-col text-brand-text bg-background">
        {children}
      </body>
    </html>
  )
}
