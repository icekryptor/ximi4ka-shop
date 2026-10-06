'use client'

import { useMemo, useState } from 'react'
import type { Product, ProductCategory, ShippingBox, StockStatus } from '@ximi4ka-shop/shared'
import { ImageUploadField, MultiImageUploadField } from './ImageUploadField'
import { BlockEditor } from './block-editor/BlockEditor'
import { ApiError, type AdminProductInput } from '@/lib/adminApi'
import { LanguageTabs, countFilled } from './LanguageTabs'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n'
import { buildCategoryTree, flattenTree } from '@/lib/categoryTree'

// Which fields we consider for EN completeness. We keep the list
// small on purpose — admins translate top-of-funnel SEO copy first;
// long blocks can come later without blocking launch.
const EN_TRACKED_FIELDS = ['name', 'metaTitle', 'metaDescription'] as const

// Коробки в том порядке, в каком они уходят в shipBoxes. Лимиты совпадают
// с CreateProductSchema (api/src/routes/admin/products.schemas.ts).
const BOX_FIELDS: { box: ShippingBox; id: string; label: string }[] = [
  { box: 'small', id: 'box-small', label: 'Малая коробка, шт' },
  { box: 'medium', id: 'box-medium', label: 'Средняя коробка, шт' },
  { box: 'elektro', id: 'box-elektro', label: 'Коробка Электро, шт' },
  { box: 'large', id: 'box-large', label: 'Большая коробка, шт' },
]
const MAX_BOXES = 10
const MAX_WEIGHT_G = 50_000
const MAX_LOOSE_UNITS = 500

function countBoxes(boxes: ShippingBox[] | undefined): Record<ShippingBox, number> {
  const counts: Record<ShippingBox, number> = { small: 0, medium: 0, elektro: 0, large: 0 }
  for (const b of boxes ?? []) counts[b] += 1
  return counts
}

interface Props {
  mode: 'create' | 'edit'
  initialValue?: Product
  // Все категории магазина — для выбора категорий товара.
  allCategories?: ProductCategory[]
  onSubmit: (input: AdminProductInput) => Promise<void>
  submitting: boolean
  error?: ApiError | null
}

const SLUG_RE = /^[a-z0-9-]+$/

interface ImageItem {
  url: string
  alt: string
}

// Controlled create/edit form. Groups inputs by section; keeps local state
// only (the parent decides how to submit).
export function ProductForm({
  mode,
  initialValue,
  allCategories = [],
  onSubmit,
  submitting,
  error,
}: Props) {
  const [slug, setSlug] = useState(initialValue?.slug ?? '')
  const [name, setName] = useState(initialValue?.name ?? '')
  const [sku, setSku] = useState(initialValue?.sku ?? '')
  const [priceRub, setPriceRub] = useState<number>(initialValue?.priceRub ?? 0)
  const [compareAt, setCompareAt] = useState<number | ''>(initialValue?.compareAtPriceRub ?? '')
  const [stockStatus, setStockStatus] = useState<StockStatus>(
    initialValue?.stockStatus ?? 'in_stock',
  )
  const [sortOrder, setSortOrder] = useState<number>(initialValue?.sortOrder ?? 0)
  const [shortDescription, setShortDescription] = useState(initialValue?.shortDescription ?? '')
  const [longDescriptionBlocks, setLongDescriptionBlocks] = useState<unknown[]>(
    () => initialValue?.longDescriptionBlocks ?? [],
  )

  // Категории и доставка
  const [categoryIds, setCategoryIds] = useState<string[]>(initialValue?.categoryIds ?? [])
  const [weightG, setWeightG] = useState<number | ''>(initialValue?.weightG ?? '')
  const [boxCounts, setBoxCounts] = useState<Record<ShippingBox, number>>(() =>
    countBoxes(initialValue?.shipBoxes),
  )
  const [looseUnits, setLooseUnits] = useState<number>(initialValue?.looseUnits ?? 1)
  const [minBox, setMinBox] = useState<ShippingBox | ''>(initialValue?.minBox ?? '')
  const categoryOptions = useMemo(
    () => flattenTree(buildCategoryTree(allCategories)),
    [allCategories],
  )

  // SEO
  const [metaTitle, setMetaTitle] = useState(initialValue?.metaTitle ?? '')
  const [metaDescription, setMetaDescription] = useState(initialValue?.metaDescription ?? '')
  const [ogImage, setOgImage] = useState<string | null>(initialValue?.ogImage ?? null)
  const [canonicalUrl, setCanonicalUrl] = useState(initialValue?.canonicalUrl ?? '')
  const [noindex, setNoindex] = useState<boolean>(initialValue?.noindex ?? false)

  // Media gallery
  const [images, setImages] = useState<ImageItem[]>(
    () =>
      (initialValue?.images ?? []).map((img) => ({
        url: img.url,
        alt: img.alt ?? '',
      })) as ImageItem[],
  )

  // i18n — active tab + per-locale translation state. Only non-default
  // locales are stored here; RU lives in the top-level state above and
  // is the source of truth (written to the entity's columns directly).
  const [activeLocale, setActiveLocale] = useState<Locale>(DEFAULT_LOCALE)
  const initialEn = (initialValue?.translations as { en?: Record<string, unknown> } | undefined)?.en
  const [enName, setEnName] = useState<string>(
    typeof initialEn?.name === 'string' ? initialEn.name : '',
  )
  const [enMetaTitle, setEnMetaTitle] = useState<string>(
    typeof initialEn?.metaTitle === 'string' ? initialEn.metaTitle : '',
  )
  const [enMetaDescription, setEnMetaDescription] = useState<string>(
    typeof initialEn?.metaDescription === 'string' ? initialEn.metaDescription : '',
  )

  const [formError, setFormError] = useState<string | null>(null)

  const slugInvalid = slug !== '' && !SLUG_RE.test(slug)

  const disabled = useMemo(() => submitting, [submitting])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!slug || slugInvalid) {
      setFormError('Укажите корректный slug (латиница, цифры, тире).')
      return
    }
    if (!name.trim()) {
      setFormError('Название обязательно.')
      return
    }
    if (!Number.isFinite(priceRub) || priceRub < 0) {
      setFormError('Цена должна быть неотрицательным числом.')
      return
    }

    if (weightG !== '' && (!Number.isInteger(weightG) || weightG < 1 || weightG > MAX_WEIGHT_G)) {
      setFormError(`Вес — целое число граммов от 1 до ${MAX_WEIGHT_G}.`)
      return
    }
    if (!Number.isInteger(looseUnits) || looseUnits < 1 || looseUnits > MAX_LOOSE_UNITS) {
      setFormError(`«Предметов мелочи» — целое число от 1 до ${MAX_LOOSE_UNITS}.`)
      return
    }
    const boxValues = BOX_FIELDS.map(({ box }) => boxCounts[box])
    if (boxValues.some((n) => !Number.isInteger(n) || n < 0)) {
      setFormError('Число коробок — целое неотрицательное.')
      return
    }
    if (boxValues.reduce((a, b) => a + b, 0) > MAX_BOXES) {
      setFormError(`Коробок у одного товара не больше ${MAX_BOXES}.`)
      return
    }

    // Порядок коробок в shipBoxes задаёт, в какое место едет товар (pack.ts),
    // поэтому, если счётчики не менялись, отдаём исходный список как есть.
    const initialBoxes = initialValue?.shipBoxes ?? []
    const initialCounts = countBoxes(initialBoxes)
    const boxesUnchanged = BOX_FIELDS.every(({ box }) => initialCounts[box] === boxCounts[box])
    const nextShipBoxes = boxesUnchanged
      ? initialBoxes
      : BOX_FIELDS.flatMap(({ box }) => Array<ShippingBox>(boxCounts[box]).fill(box))

    const input: AdminProductInput = {
      slug,
      name: name.trim(),
      sku: sku.trim() || null,
      priceRub: Math.trunc(priceRub),
      compareAtPriceRub: compareAt === '' ? null : Math.trunc(Number(compareAt)),
      stockStatus,
      sortOrder: Math.trunc(sortOrder),
      shortDescription: shortDescription.trim() || null,
      longDescriptionBlocks,
      metaTitle: metaTitle.trim() || null,
      metaDescription: metaDescription.trim() || null,
      ogImage: ogImage || null,
      canonicalUrl: canonicalUrl.trim() || null,
      noindex,
      weightG: weightG === '' ? null : weightG,
      shipBoxes: nextShipBoxes,
      looseUnits,
      minBox: minBox === '' ? null : minBox,
    }
    // Без categoryIds в ответе API (старый сервер) пустой список стёр бы связи
    // товара, поэтому в режиме правки шлём его только когда он известен.
    if (mode === 'create' || initialValue?.categoryIds !== undefined) {
      input.categoryIds = categoryIds
    }

    // Build the translations blob. EN fields go under `translations.en`;
    // we only include them if they're non-empty (keeps the JSON clean and
    // avoids falsely marking incomplete locales as translated). Gallery
    // images still ride in the top-level translations map for now — a
    // dedicated product_images endpoint is a future concern.
    const enBlock: Record<string, unknown> = {}
    if (enName.trim()) enBlock.name = enName.trim()
    if (enMetaTitle.trim()) enBlock.metaTitle = enMetaTitle.trim()
    if (enMetaDescription.trim()) enBlock.metaDescription = enMetaDescription.trim()

    const nextTranslations: Record<string, unknown> = {
      ...(initialValue?.translations ?? {}),
    }
    if (Object.keys(enBlock).length > 0) {
      nextTranslations.en = enBlock
    } else {
      // Clear stale EN data if the admin emptied every field.
      delete nextTranslations.en
    }
    if (images.length > 0) {
      nextTranslations.gallery = images
    }
    if (Object.keys(nextTranslations).length > 0) {
      input.translations = nextTranslations
    }

    await onSubmit(input)
  }

  const enFilled = countFilled([enName, enMetaTitle, enMetaDescription])

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={mode === 'create' ? 'Создание товара' : 'Редактирование товара'}
      className="space-y-8"
    >
      <div className="flex items-center justify-between">
        <LanguageTabs
          active={activeLocale}
          onChange={setActiveLocale}
          completeness={{
            en: { filled: enFilled, total: EN_TRACKED_FIELDS.length },
          }}
        />
        <span className="text-xs text-brand-text-secondary">
          RU — основная версия, EN — перевод с фолбэком
        </span>
      </div>

      <Section title="Основные">
        <Field label="Slug" htmlFor="slug" error={slugInvalid ? 'Недопустимый slug' : undefined}>
          <input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="test-kit-3-3"
            required
            className="input"
          />
        </Field>
        {activeLocale === DEFAULT_LOCALE ? (
          <Field label="Название" htmlFor="name">
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="input"
            />
          </Field>
        ) : (
          <Field label="Название (EN)" htmlFor="name-en">
            <input
              id="name-en"
              value={enName}
              onChange={(e) => setEnName(e.target.value)}
              placeholder={name || 'RU fallback'}
              className="input"
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="SKU" htmlFor="sku">
            <input
              id="sku"
              value={sku ?? ''}
              onChange={(e) => setSku(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Наличие" htmlFor="stock-status">
            <select
              id="stock-status"
              value={stockStatus}
              onChange={(e) => setStockStatus(e.target.value as StockStatus)}
              className="input"
            >
              <option value="in_stock">В наличии</option>
              <option value="out_of_stock">Нет в наличии</option>
              <option value="preorder">Предзаказ</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Цена, ₽" htmlFor="price">
            <input
              id="price"
              type="number"
              min={0}
              value={priceRub}
              onChange={(e) => setPriceRub(Number(e.target.value))}
              required
              className="input"
            />
          </Field>
          <Field label="Старая цена, ₽" htmlFor="compare-at">
            <input
              id="compare-at"
              type="number"
              min={0}
              value={compareAt}
              onChange={(e) => setCompareAt(e.target.value === '' ? '' : Number(e.target.value))}
              className="input"
            />
          </Field>
          <Field label="Сортировка" htmlFor="sort-order">
            <input
              id="sort-order"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="input"
            />
          </Field>
        </div>
        <Field label="Короткое описание" htmlFor="short-desc">
          <textarea
            id="short-desc"
            value={shortDescription ?? ''}
            onChange={(e) => setShortDescription(e.target.value)}
            rows={3}
            className="input"
          />
        </Field>
      </Section>

      <Section
        title="Категории"
        note="Товар без категории не показывается в каталоге, но открывается по ссылке."
      >
        {categoryOptions.length === 0 ? (
          <p className="text-sm text-brand-text-secondary">Категорий пока нет.</p>
        ) : (
          <div className="space-y-1">
            {categoryOptions.map((node) => (
              <label
                key={node.id}
                className="flex items-center gap-2 text-sm text-brand-text"
                style={{ paddingLeft: `${node.depth * 1.25}rem` }}
              >
                <input
                  type="checkbox"
                  checked={categoryIds.includes(node.id)}
                  onChange={(e) =>
                    setCategoryIds((prev) =>
                      e.target.checked ? [...prev, node.id] : prev.filter((id) => id !== node.id),
                    )
                  }
                />
                <span>{node.name}</span>
              </label>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Доставка (СДЭК)"
        note="Без веса расчёт берёт 100 г. «Коробки» — для наборов, которые едут в своих коробках; мелочь раскладывается по числу предметов."
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Вес, г" htmlFor="weight-g">
            <input
              id="weight-g"
              type="number"
              min={1}
              max={MAX_WEIGHT_G}
              value={weightG}
              onChange={(e) => setWeightG(e.target.value === '' ? '' : Number(e.target.value))}
              className="input"
            />
          </Field>
          <Field label="Предметов мелочи в штуке" htmlFor="loose-units">
            <input
              id="loose-units"
              type="number"
              min={1}
              max={MAX_LOOSE_UNITS}
              value={looseUnits}
              onChange={(e) => setLooseUnits(Number(e.target.value))}
              className="input"
            />
          </Field>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {BOX_FIELDS.map(({ box, id, label }) => (
            <Field key={box} label={label} htmlFor={id}>
              <input
                id={id}
                type="number"
                min={0}
                max={MAX_BOXES}
                value={boxCounts[box]}
                onChange={(e) =>
                  setBoxCounts((prev) => ({ ...prev, [box]: Number(e.target.value) }))
                }
                className="input"
              />
            </Field>
          ))}
        </div>
        <Field label="Минимальная коробка для мелочи" htmlFor="min-box">
          <select
            id="min-box"
            value={minBox}
            onChange={(e) => setMinBox(e.target.value as ShippingBox | '')}
            className="input"
          >
            <option value="">— По числу предметов —</option>
            <option value="small">Малая</option>
            <option value="medium">Средняя</option>
            <option value="elektro">Электро</option>
            <option value="large">Большая</option>
          </select>
        </Field>
      </Section>

      <Section title="Медиа">
        <ImageUploadField
          id="og-image"
          label="OG-изображение (для соцсетей)"
          value={ogImage}
          onChange={setOgImage}
        />
        <MultiImageUploadField label="Галерея товара" value={images} onChange={setImages} />
      </Section>

      <Section title="Описание (блоки)">
        <BlockEditor
          value={longDescriptionBlocks}
          onChange={(blocks) => setLongDescriptionBlocks(blocks)}
        />
      </Section>

      <Section title="SEO">
        {activeLocale === DEFAULT_LOCALE ? (
          <>
            <Field label="Meta title" htmlFor="meta-title">
              <input
                id="meta-title"
                value={metaTitle ?? ''}
                onChange={(e) => setMetaTitle(e.target.value)}
                maxLength={255}
                className="input"
              />
            </Field>
            <Field label="Meta description" htmlFor="meta-desc">
              <textarea
                id="meta-desc"
                value={metaDescription ?? ''}
                onChange={(e) => setMetaDescription(e.target.value)}
                rows={3}
                maxLength={2000}
                className="input"
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Meta title (EN)" htmlFor="meta-title-en">
              <input
                id="meta-title-en"
                value={enMetaTitle}
                onChange={(e) => setEnMetaTitle(e.target.value)}
                maxLength={255}
                placeholder={metaTitle ?? ''}
                className="input"
              />
            </Field>
            <Field label="Meta description (EN)" htmlFor="meta-desc-en">
              <textarea
                id="meta-desc-en"
                value={enMetaDescription}
                onChange={(e) => setEnMetaDescription(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={metaDescription ?? ''}
                className="input"
              />
            </Field>
          </>
        )}
        <Field label="Canonical URL" htmlFor="canonical-url">
          <input
            id="canonical-url"
            value={canonicalUrl ?? ''}
            onChange={(e) => setCanonicalUrl(e.target.value)}
            maxLength={500}
            className="input"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-brand-text">
          <input type="checkbox" checked={noindex} onChange={(e) => setNoindex(e.target.checked)} />
          <span>noindex (исключить из поисковой выдачи)</span>
        </label>
      </Section>

      {formError || error ? (
        <div role="alert" className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">
          {formError ??
            (error
              ? error.code === 'slug_conflict'
                ? 'Товар с таким slug уже существует.'
                : error.message
              : '')}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={disabled}
          className="px-5 py-2.5 rounded-full bg-brand text-white font-semibold disabled:opacity-50"
        >
          {submitting ? 'Сохранение...' : mode === 'create' ? 'Создать' : 'Сохранить'}
        </button>
      </div>
    </form>
  )
}

function Section({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-brand-border p-6">
      <h2 className="text-lg font-semibold text-brand-text mb-4">{title}</h2>
      {note ? <p className="text-xs text-brand-text-secondary mb-3">{note}</p> : null}
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-brand-text-secondary mb-1">
        {label}
      </label>
      {children}
      {error ? <div className="mt-1 text-xs text-red-600">{error}</div> : null}
    </div>
  )
}
