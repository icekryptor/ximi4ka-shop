import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { CartDrawer } from '@/components/CartDrawer'

// Public storefront chrome. All non-admin routes live under this group so
// they all get the same sticky Header + Footer + shared CartDrawer without
// polluting /admin/* routes with public nav.
export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartDrawer />
    </>
  )
}
