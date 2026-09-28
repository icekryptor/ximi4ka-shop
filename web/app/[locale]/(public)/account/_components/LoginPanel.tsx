'use client'

import type { AuthConfig } from '@ximi4ka-shop/shared'
import { startEmailLogin, startTelegramLogin, verifyEmailLogin } from '@/lib/accountApi'
import { redirectTo } from '@/lib/checkout'
import { EmailCodeForm } from './EmailCodeForm'
import { SupportButton } from './SupportButton'
import { TelegramConnect } from './TelegramConnect'

// Полная перезагрузка, а не router.push: серверный layout кабинета должен
// увидеть только что выставленную cookie сессии.
//
// На сайте нет страницы политики обработки персональных данных (в CMS
// заведены только «Главная», «Контакты», «О нас», «Доставка и оплата» —
// проверено по таблице pages), поэтому текст ниже — без ссылки, как на
// чекауте (checkout/page.tsx:314). Страницу политики стоит завести в
// админке: ссылку на неё требует 152-ФЗ.
export function LoginPanel({ next, config }: { next: string; config: AuthConfig }) {
  const done = () => redirectTo(next)

  if (!config.email && !config.telegram) {
    return (
      <div className="flex flex-col gap-4">
        <p className="opacity-70">
          Вход в личный кабинет временно недоступен. Если нужна помощь с заказом — напишите в
          поддержку.
        </p>
        <SupportButton />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h2 className="font-lj-mono uppercase tracking-[0.08em] text-[length:var(--text-lj-mono-sm)] opacity-70 m-0">
          По почте
        </h2>
        {config.email ? (
          <EmailCodeForm start={startEmailLogin} verify={verifyEmailLogin} onDone={done} />
        ) : (
          <p className="opacity-70">Вход по почте временно недоступен</p>
        )}
      </section>

      {config.telegram && (
        <section className="flex flex-col gap-4">
          <h2 className="font-lj-mono uppercase tracking-[0.08em] text-[length:var(--text-lj-mono-sm)] opacity-70 m-0">
            Через Telegram
          </h2>
          <TelegramConnect label="Войти через Telegram" start={startTelegramLogin} onDone={done} />
        </section>
      )}

      <p className="font-lj-mono text-[length:var(--text-lj-mono-xs)] uppercase tracking-[0.06em] opacity-50 m-0">
        Регистрироваться отдельно не нужно — аккаунт появится при первом входе. Продолжая, вы
        соглашаетесь с условиями обработки персональных данных.
      </p>
    </div>
  )
}
