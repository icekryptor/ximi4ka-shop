import Link from 'next/link'
import { fetchCurrentAdmin } from '@/lib/adminSession'

// Раздел только для роли admin (заказы с персональными данными покупателей,
// настройки сайта). API и так вернёт 403, но по прямой ссылке редактор должен
// увидеть понятное сообщение, а не ошибку страницы. Роль сверяется строго.
// Оборачивать надо содержимое страницы внутри самой страницы, а не layout:
// layout и page рендерятся параллельно, и layout не остановил бы запрос данных.
export async function AdminOnly({ children }: Readonly<{ children: React.ReactNode }>) {
  const admin = await fetchCurrentAdmin()
  if (admin?.role !== 'admin') {
    return (
      <div className="max-w-xl p-8 bg-white rounded-2xl border border-brand-border">
        <h1 className="text-xl font-semibold text-brand-text">Недостаточно прав</h1>
        <p className="mt-2 text-brand-text-secondary">
          Этот раздел доступен только администратору. Если он нужен вам для работы, попросите
          администратора выдать доступ.
        </p>
        <Link href="/admin" className="mt-4 inline-block text-brand underline">
          Перейти на главную админки
        </Link>
      </div>
    )
  }
  return <>{children}</>
}
