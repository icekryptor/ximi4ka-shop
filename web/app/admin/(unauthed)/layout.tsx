// (unauthed) admin subtree: currently just the login page. Renders full-bleed
// without any admin shell. No auth check — this is how unauthenticated
// visitors get in.
export default function UnauthedAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="min-h-screen bg-brand-bg-soft">{children}</div>
}
