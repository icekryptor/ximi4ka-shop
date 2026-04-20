// Top-level admin layout — intentionally a pass-through. The real work
// (auth guard, shell chrome) lives in app/admin/(authed)/layout.tsx; the
// login page lives under app/admin/(unauthed)/login.
//
// Route groups let the login page render without the sidebar while every
// other /admin/* route is auth-gated. Keeping a segment layout at this level
// also prevents the root layout's public chrome from ever touching /admin.
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>
}
