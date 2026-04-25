'use client'

import { useState } from 'react'
import {
  ApiError,
  adminUpdateSettings,
  type AdminSettingsPatch,
  type SiteSettings,
  type Testimonial,
  type TrustStripItem,
} from '@/lib/adminApi'

// Hard caps mirror the zod schema in api/src/routes/admin/settings.ts so the
// admin form can pre-emptively hide the "+" buttons when they'd be rejected.
const TRUST_STRIP_MAX = 8
const TESTIMONIALS_MAX = 20

interface Props {
  initial: SiteSettings
}

// Convert "" -> null before sending so empty form fields clear the column
// instead of storing the empty string. Keeps a later admin revisiting the
// form from seeing "" (which looks disabled) when they mean "unset".
function nullifyBlank(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

// Client-side URL sanity check so the admin sees an error inline before the
// request round-trip. The server does the authoritative check via zod.
function isValidUrlOrEmpty(value: string): boolean {
  if (value.trim() === '') return true
  try {
    new URL(value.trim())
    return true
  } catch {
    return false
  }
}

export function SettingsForm({ initial }: Props) {
  const [metrikaId, setMetrikaId] = useState(initial.metrikaId ?? '')
  const [ga4Id, setGa4Id] = useState(initial.ga4Id ?? '')
  const [robotsTxt, setRobotsTxt] = useState(initial.robotsTxt)
  const [llmsTxt, setLlmsTxt] = useState(initial.llmsTxt)
  const [yandexWebmasterVerification, setYandexWebmasterVerification] =
    useState(initial.yandexWebmasterVerification ?? '')
  const [googleSiteVerification, setGoogleSiteVerification] = useState(
    initial.googleSiteVerification ?? '',
  )
  const [ymlShopName, setYmlShopName] = useState(initial.ymlShopName ?? '')
  const [ymlCompany, setYmlCompany] = useState(initial.ymlCompany ?? '')
  const [ymlUrl, setYmlUrl] = useState(initial.ymlUrl ?? '')
  const [ymlCurrency, setYmlCurrency] = useState<'RUB' | 'RUR'>(
    initial.ymlCurrency,
  )
  const [ymlDeliveryNote, setYmlDeliveryNote] = useState(
    initial.ymlDeliveryNote ?? '',
  )
  // Preview state — drives the "Проверить YML" panel. Kept local to the form
  // since it's ephemeral: closing the page discards it, matching the rest of
  // the admin's one-shot validation affordances (e.g. redirects CSV import).
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewReport, setPreviewReport] = useState<{
    ok: boolean
    offersCount: number
    issues: string[]
    snippet: string
  } | null>(null)
  const [yandexPayEnabled, setYandexPayEnabled] = useState(
    initial.yandexPayEnabled,
  )
  const [yandexPayMode, setYandexPayMode] = useState<'sandbox' | 'production'>(
    initial.yandexPayMode,
  )
  // Marketing fields. headerPromoText is a single nullable text blob; the
  // two list editors keep their state as plain arrays of objects, with
  // helpers below to add / update / remove rows.
  const [headerPromoText, setHeaderPromoText] = useState(
    initial.headerPromoText ?? '',
  )
  const [trustStripItems, setTrustStripItems] = useState<TrustStripItem[]>(
    initial.trustStripItems ?? [],
  )
  const [testimonials, setTestimonials] = useState<Testimonial[]>(
    initial.testimonials ?? [],
  )

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [apiError, setApiError] = useState<ApiError | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setApiError(null)
    setSavedAt(null)

    if (!isValidUrlOrEmpty(ymlUrl)) {
      setFormError('URL для YML должен быть корректным (https://...).')
      return
    }

    const patch: AdminSettingsPatch = {
      metrikaId: nullifyBlank(metrikaId),
      ga4Id: nullifyBlank(ga4Id),
      robotsTxt,
      llmsTxt,
      yandexWebmasterVerification: nullifyBlank(yandexWebmasterVerification),
      googleSiteVerification: nullifyBlank(googleSiteVerification),
      ymlShopName: nullifyBlank(ymlShopName),
      ymlCompany: nullifyBlank(ymlCompany),
      ymlUrl: nullifyBlank(ymlUrl),
      ymlCurrency,
      ymlDeliveryNote: nullifyBlank(ymlDeliveryNote),
      yandexPayEnabled,
      yandexPayMode,
      headerPromoText: nullifyBlank(headerPromoText),
      trustStripItems,
      testimonials,
    }

    setSubmitting(true)
    try {
      await adminUpdateSettings(patch)
      setSavedAt(Date.now())
    } catch (err) {
      if (err instanceof ApiError) setApiError(err)
      else setApiError(new ApiError(500, 'network_error', 'Ошибка сети'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Настройки сайта"
      className="space-y-6"
    >
      <Section title="Аналитика">
        <Field label="Яндекс.Метрика (ID счётчика)" htmlFor="metrika-id">
          <input
            id="metrika-id"
            value={metrikaId}
            onChange={(e) => setMetrikaId(e.target.value)}
            placeholder="12345678"
            className="input"
          />
          <p className="mt-1 text-xs text-brand-text-secondary">
            Числовой идентификатор из интерфейса Метрики. Оставьте пустым, чтобы
            отключить.
          </p>
        </Field>
        <Field label="Google Analytics 4 (Measurement ID)" htmlFor="ga4-id">
          <input
            id="ga4-id"
            value={ga4Id}
            onChange={(e) => setGa4Id(e.target.value)}
            placeholder="G-XXXXXXXXXX"
            className="input"
          />
        </Field>
      </Section>

      <Section title="SEO">
        <Field label="robots.txt" htmlFor="robots-txt">
          <textarea
            id="robots-txt"
            value={robotsTxt}
            onChange={(e) => setRobotsTxt(e.target.value)}
            rows={6}
            className="input font-mono text-xs"
          />
          <p className="mt-1 text-xs text-brand-text-secondary">
            Публикуется по адресу <code>/robots.txt</code>.
          </p>
        </Field>
        <Field label="llms.txt" htmlFor="llms-txt">
          <textarea
            id="llms-txt"
            value={llmsTxt}
            onChange={(e) => setLlmsTxt(e.target.value)}
            rows={8}
            className="input font-mono text-xs"
          />
          <p className="mt-1 text-xs text-brand-text-secondary">
            Публикуется по адресу <code>/llms.txt</code>.
          </p>
        </Field>
        <Field
          label="Яндекс.Вебмастер — код подтверждения"
          htmlFor="yandex-webmaster"
        >
          <input
            id="yandex-webmaster"
            value={yandexWebmasterVerification}
            onChange={(e) => setYandexWebmasterVerification(e.target.value)}
            className="input"
          />
        </Field>
        <Field
          label="Google Search Console — код подтверждения"
          htmlFor="google-site-verification"
        >
          <input
            id="google-site-verification"
            value={googleSiteVerification}
            onChange={(e) => setGoogleSiteVerification(e.target.value)}
            className="input"
          />
        </Field>
      </Section>

      <Section title="YML-фид">
        <Field label="Название магазина" htmlFor="yml-shop-name">
          <input
            id="yml-shop-name"
            value={ymlShopName}
            onChange={(e) => setYmlShopName(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Юр. лицо" htmlFor="yml-company">
          <input
            id="yml-company"
            value={ymlCompany}
            onChange={(e) => setYmlCompany(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="URL магазина" htmlFor="yml-url">
          <input
            id="yml-url"
            type="url"
            value={ymlUrl}
            onChange={(e) => setYmlUrl(e.target.value)}
            placeholder="https://ximi4ka.ru"
            className="input"
          />
        </Field>
        <Field label="Валюта" htmlFor="yml-currency">
          <select
            id="yml-currency"
            value={ymlCurrency}
            onChange={(e) =>
              setYmlCurrency(e.target.value as 'RUB' | 'RUR')
            }
            className="input"
          >
            <option value="RUB">RUB — ISO 4217</option>
            <option value="RUR">RUR — устаревший код</option>
          </select>
          <p className="mt-1 text-xs text-brand-text-secondary">
            Код валюты в YML. Большинство площадок принимают обе формы, RUB
            — современный ISO 4217.
          </p>
        </Field>
        <Field label="Примечание о доставке" htmlFor="yml-delivery-note">
          <textarea
            id="yml-delivery-note"
            value={ymlDeliveryNote}
            onChange={(e) => setYmlDeliveryNote(e.target.value)}
            rows={3}
            className="input"
            placeholder="Доставка по России — 3-7 дней"
          />
        </Field>
        <div className="pt-2 border-t border-brand-border">
          <button
            type="button"
            onClick={async () => {
              setPreviewLoading(true)
              setPreviewError(null)
              setPreviewReport(null)
              try {
                const { adminPreviewYml } = await import('@/lib/adminApi')
                const { validateYmlPreview } = await import('@/lib/ymlPreview')
                const xml = await adminPreviewYml()
                setPreviewReport(validateYmlPreview(xml))
              } catch (err) {
                if (err instanceof ApiError) setPreviewError(err.message)
                else setPreviewError('Не удалось получить YML-фид')
              } finally {
                setPreviewLoading(false)
              }
            }}
            disabled={previewLoading}
            className="px-4 py-2 rounded-full border border-brand text-brand text-sm font-medium disabled:opacity-50"
          >
            {previewLoading ? 'Проверка...' : 'Проверить YML'}
          </button>
          {previewError && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {previewError}
            </p>
          )}
          {previewReport && (
            <div
              role="status"
              data-testid="yml-preview-report"
              className="mt-3 p-3 rounded-xl border border-brand-border bg-brand-bg-muted text-sm space-y-2"
            >
              <p className={previewReport.ok ? 'text-green-700' : 'text-red-700'}>
                {previewReport.ok
                  ? `OK — ${previewReport.offersCount} предложений`
                  : `Найдены проблемы (${previewReport.issues.length})`}
              </p>
              {previewReport.issues.length > 0 && (
                <ul className="list-disc pl-5 text-red-700 text-xs">
                  {previewReport.issues.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              )}
              <details className="text-xs">
                <summary className="cursor-pointer text-brand-text-secondary">
                  Первые 20 предложений (сокращённо)
                </summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-brand-text-secondary">
                  {previewReport.snippet}
                </pre>
              </details>
            </div>
          )}
        </div>
      </Section>

      <Section title="Яндекс.Pay">
        <div className="flex items-center gap-3">
          <input
            id="yandex-pay-enabled"
            type="checkbox"
            checked={yandexPayEnabled}
            onChange={(e) => setYandexPayEnabled(e.target.checked)}
          />
          <label
            htmlFor="yandex-pay-enabled"
            className="text-sm text-brand-text"
          >
            Включить Яндекс.Pay в оформлении заказа
          </label>
        </div>
        <Field label="Режим" htmlFor="yandex-pay-mode">
          <select
            id="yandex-pay-mode"
            value={yandexPayMode}
            onChange={(e) =>
              setYandexPayMode(e.target.value as 'sandbox' | 'production')
            }
            className="input"
          >
            <option value="sandbox">Sandbox (тестовый)</option>
            <option value="production">Production</option>
          </select>
          <p className="mt-1 text-xs text-brand-text-secondary">
            Учётные данные платёжной системы хранятся в переменных окружения, а
            не в базе.
          </p>
        </Field>
      </Section>

      <Section title="Маркетинг">
        <Field
          label="Текст промо-полосы в шапке (оставьте пустым, чтобы скрыть)"
          htmlFor="header-promo-text"
        >
          <textarea
            id="header-promo-text"
            value={headerPromoText}
            onChange={(e) => setHeaderPromoText(e.target.value)}
            rows={2}
            className="input"
            placeholder="Бесплатная доставка от 3000 ₽"
          />
        </Field>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-brand-text">
            Доверие в шапке
          </h3>
          {trustStripItems.length === 0 ? (
            <p className="text-xs text-brand-text-secondary">
              Список пуст — добавьте первый элемент.
            </p>
          ) : (
            <ul className="space-y-2" data-testid="trust-strip-list">
              {trustStripItems.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2"
                  data-testid={`trust-strip-row-${idx}`}
                >
                  <input
                    aria-label={`Иконка ${idx + 1}`}
                    value={item.icon}
                    onChange={(e) => {
                      const next = [...trustStripItems]
                      next[idx] = { ...next[idx], icon: e.target.value }
                      setTrustStripItems(next)
                    }}
                    placeholder="🚚"
                    maxLength={64}
                    className="input w-20"
                  />
                  <input
                    aria-label={`Подпись ${idx + 1}`}
                    value={item.label}
                    onChange={(e) => {
                      const next = [...trustStripItems]
                      next[idx] = { ...next[idx], label: e.target.value }
                      setTrustStripItems(next)
                    }}
                    placeholder="Доставка по России"
                    maxLength={255}
                    className="input flex-1"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setTrustStripItems(
                        trustStripItems.filter((_, i) => i !== idx),
                      )
                    }
                    className="px-3 py-2 rounded-full border border-brand-border text-sm text-brand-text-secondary"
                  >
                    Удалить
                  </button>
                </li>
              ))}
            </ul>
          )}
          {trustStripItems.length < TRUST_STRIP_MAX && (
            <button
              type="button"
              onClick={() =>
                setTrustStripItems([
                  ...trustStripItems,
                  { icon: '', label: '' },
                ])
              }
              className="px-3 py-2 rounded-full border border-brand text-brand text-sm"
            >
              + Добавить
            </button>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-brand-text">Отзывы</h3>
          {testimonials.length === 0 ? (
            <p className="text-xs text-brand-text-secondary">
              Список пуст — добавьте первый отзыв.
            </p>
          ) : (
            <ul className="space-y-3" data-testid="testimonials-list">
              {testimonials.map((t, idx) => (
                <li
                  key={idx}
                  className="rounded-xl border border-brand-border p-3 space-y-2"
                  data-testid={`testimonial-row-${idx}`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-brand-text">
                      {`Отзыв ${idx + 1}`}
                    </h4>
                    <button
                      type="button"
                      onClick={() =>
                        setTestimonials(
                          testimonials.filter((_, i) => i !== idx),
                        )
                      }
                      className="px-3 py-1 rounded-full border border-brand-border text-xs text-brand-text-secondary"
                    >
                      Удалить
                    </button>
                  </div>
                  <textarea
                    aria-label={`Цитата ${idx + 1}`}
                    value={t.quote}
                    onChange={(e) => {
                      const next = [...testimonials]
                      next[idx] = { ...next[idx], quote: e.target.value }
                      setTestimonials(next)
                    }}
                    rows={3}
                    maxLength={2000}
                    className="input w-full"
                  />
                  <input
                    aria-label={`Автор ${idx + 1}`}
                    value={t.author}
                    onChange={(e) => {
                      const next = [...testimonials]
                      next[idx] = { ...next[idx], author: e.target.value }
                      setTestimonials(next)
                    }}
                    placeholder="Анна"
                    maxLength={255}
                    className="input w-full"
                  />
                  <input
                    aria-label={`Город ${idx + 1}`}
                    value={t.location}
                    onChange={(e) => {
                      const next = [...testimonials]
                      next[idx] = { ...next[idx], location: e.target.value }
                      setTestimonials(next)
                    }}
                    placeholder="Москва"
                    maxLength={255}
                    className="input w-full"
                  />
                  <input
                    aria-label={`Рейтинг ${idx + 1}`}
                    type="number"
                    min={1}
                    max={5}
                    value={t.rating ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value
                      const next = [...testimonials]
                      // Empty input clears the optional rating; otherwise
                      // coerce to int and clamp via the schema on the server.
                      if (raw === '') {
                        const copy = { ...next[idx] }
                        delete copy.rating
                        next[idx] = copy
                      } else {
                        next[idx] = { ...next[idx], rating: Number(raw) }
                      }
                      setTestimonials(next)
                    }}
                    placeholder="5"
                    className="input w-24"
                  />
                </li>
              ))}
            </ul>
          )}
          {testimonials.length < TESTIMONIALS_MAX && (
            <button
              type="button"
              onClick={() =>
                setTestimonials([
                  ...testimonials,
                  { quote: '', author: '', location: '' },
                ])
              }
              className="px-3 py-2 rounded-full border border-brand text-brand text-sm"
            >
              + Добавить
            </button>
          )}
        </div>
      </Section>

      {formError || apiError ? (
        <div
          role="alert"
          className="p-3 rounded-xl bg-red-50 text-red-700 text-sm"
        >
          {formError ?? apiError?.message}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2.5 rounded-full bg-brand text-white font-semibold disabled:opacity-50"
        >
          {submitting ? 'Сохранение...' : 'Сохранить'}
        </button>
        {savedAt ? (
          <span
            role="status"
            className="text-sm text-green-700"
            data-testid="saved-indicator"
          >
            Сохранено ✓
          </span>
        ) : null}
      </div>
    </form>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-brand-border p-6 space-y-4">
      <h2 className="text-lg font-semibold text-brand-text">{title}</h2>
      {children}
    </section>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-brand-text-secondary mb-1"
      >
        {label}
      </label>
      {children}
    </div>
  )
}
