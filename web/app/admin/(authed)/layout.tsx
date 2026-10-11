import { redirect } from 'next/navigation'
import { AdminShell } from '@/components/admin/AdminShell'
import { fetchCurrentAdmin } from '@/lib/adminSession'

export default async function AuthedAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const admin = await fetchCurrentAdmin()
  if (!admin) {
    redirect('/admin/login')
  }
  return <AdminShell admin={admin}>{children}</AdminShell>
}
