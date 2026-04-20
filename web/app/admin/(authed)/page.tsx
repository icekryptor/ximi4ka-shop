// Admin dashboard. Minimal v1 — just a welcome message. Stat cards that
// fetch counts can land in a follow-up; keeping this page thin avoids
// baking in API shapes that will shift when admin product/category/page
// endpoints grow listing metadata.
export default function AdminDashboardPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-bold text-brand-text mb-4">Добро пожаловать</h1>
      <p className="text-brand-text-secondary">
        Используйте меню слева, чтобы перейти к управлению товарами, категориями,
        страницами и заказами.
      </p>
    </div>
  )
}
