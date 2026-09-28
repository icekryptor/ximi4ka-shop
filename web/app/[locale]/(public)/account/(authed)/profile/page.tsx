import type { Metadata } from 'next'
import { ProfilePanel } from '../../_components/ProfilePanel'

export const metadata: Metadata = { title: 'Личные данные — Ximi4ka', robots: { index: false } }

export default function AccountProfilePage() {
  return <ProfilePanel />
}
