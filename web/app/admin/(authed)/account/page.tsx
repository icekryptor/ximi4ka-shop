import { ChangePasswordForm } from '@/components/admin/ChangePasswordForm'

// Свой пароль может сменить любой вошедший пользователь админки (admin и editor).
export default function AdminAccountPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-brand-text">Смена пароля</h1>
        <p className="mt-1 text-sm text-brand-text-secondary">
          После смены остальные устройства, где вы входили в админку, потребуют войти заново.
        </p>
      </header>
      <ChangePasswordForm />
    </div>
  )
}
