import type { Metadata } from 'next'
import { buildMetadata } from '@/lib/metadata'
import { MATERIALS_CLUB_URL, MATERIALS_DISK_URL } from '@/lib/contacts'

export const metadata: Metadata = buildMetadata({
  title: 'Доступ открыт — Химичка',
  description: 'Ссылки на видеоуроки и обучающие материалы.',
  pathname: '/get_materials/thanks',
  noindex: true,
})

const BUTTON =
  'inline-flex items-center justify-center px-7 py-4 font-lj-mono text-[0.8125rem] font-medium uppercase tracking-[0.08em] rounded-full lj-cta-bright'

export default function GetMaterialsThanksPage() {
  return (
    <section className="bg-[var(--color-lj-cream)] px-6 py-16 min-h-[70vh]">
      <div className="max-w-[var(--max-lj-narrow)] mx-auto">
        <h1 className="font-lj-display font-[900] text-[clamp(2rem,5vw,3.5rem)] leading-[0.95] tracking-[-0.045em] mb-10 text-[var(--color-lj-ink)] uppercase max-w-[20ch]">
          Отлично, доступ открыт! Заберите его здесь:
        </h1>

        <div className="grid gap-8 sm:grid-cols-2 max-w-3xl">
          <div className="flex flex-col gap-4">
            <a
              href={MATERIALS_CLUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={BUTTON}
            >
              Перейти в Телеграм
            </a>
            <p className="m-0 text-sm text-[var(--color-lj-ink)] opacity-70">
              Вы перейдёте в закрытый клуб в ТГ с более чем 4000 участников, где выложены методички
              и курс по задачам, а также есть возможность задать вопрос или поделиться своими
              реакциями
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <a
              href={MATERIALS_DISK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={BUTTON}
            >
              Скачать напрямую
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
