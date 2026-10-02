import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { CartDrawer } from '@/components/CartDrawer'
import { getPublicSettings } from '@/lib/api'
import { JsonLd } from '@/components/seo/JsonLd'
import { organizationJsonLd, websiteJsonLd } from '@/lib/jsonLd'
import { SUPPORT_URL } from './account/_components/SupportButton'

// Public storefront chrome. All non-admin routes live under this group so
// they all get the same sticky Header + Footer + shared CartDrawer without
// polluting /admin/* routes with public nav.
//
// We fetch public settings here so the Header can render the optional promo
// bar. The endpoint is cached server-side; failures fall back to no promo.
export default async function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const settings = await getPublicSettings().catch(() => null)
  return (
    <>
      {/* Organization и WebSite — на каждой публичной странице (SEO-аудит). */}
      <JsonLd data={organizationJsonLd({ supportUrl: SUPPORT_URL })} />
      <JsonLd data={websiteJsonLd()} />
      <Header headerPromoText={settings?.headerPromoText ?? null} />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartDrawer />
    </>
  )
}
