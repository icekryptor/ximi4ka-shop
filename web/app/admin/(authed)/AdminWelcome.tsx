// Главная админки для тех, кому статистика не положена (редактор): суммы заказов
// только для роли admin, остальным остаётся приветствие и меню слева.
export function AdminWelcome() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-bold text-brand-text mb-4">Добро пожаловать</h1>
      <p className="text-brand-text-secondary">
        Используйте меню слева, чтобы перейти к нужному разделу.
      </p>
    </div>
  )
}
