# Лабораторный Журнал — Design System v3

**Status:** Approved 2026-04-28. Replaces v2 Neo-Russian.
**Concept artifact:** [`/concept.html`](../../../ximi4ka/concept.html) in ERP repo (preview-only).
**Scope:** Public storefront `web/` in `ximi4ka-shop`. Admin/CMS pages stay calm — token-level adoption only.

---

## 1. Philosophy

The site reads like an open laboratory notebook — cream paper pages alternating with ink instrument readouts. Swiss typographic confidence; molecular notation as ornament; warm hand-drawn callouts grounding the education feeling.

**Two surfaces, two registers.**
- **Cream (`#F2EFE8`)** — daylight, paper, education, hero / product / catalog. Body and product photography live here.
- **Ink (`#0A0A0A`)** — instrument-on, manifesto, "what's inside", pre-footer CTAs. Numbers, data viz, statements.

The transition between the two IS the cinematic moment. Section flow on every long page: cream → ink → cream → (optional ink). Never ink → ink without a cream beat in between.

**Brand purple `#836efe` is precision, not wallpaper.** Per-page budget: appears at most ~5 places. Reserved for: one emphasized headline word, one underlined manifesto phrase, hand-drawn callout strokes, eyebrow bullets, hover state on Mendeleev cells.

---

## 2. Tokens

### 2.1 Color

```css
:root {
  /* Cream Lab — daylight surface family */
  --color-cream:        #F2EFE8;  /* primary cream surface */
  --color-cream-shade:  #E8E3D7;  /* product-image background, soft surfaces */
  --color-cream-line:   rgba(10, 10, 10, 0.05);  /* blueprint grid on cream */

  /* Ink Lab — nocturnal surface family */
  --color-ink:           #0A0A0A; /* primary ink surface */
  --color-ink-elevated:  #141414; /* hover/elevated panels on ink */
  --color-bone:          #EFEDE6; /* primary text on ink */
  --color-bone-mute:     rgba(239, 237, 230, 0.60);
  --color-ink-line:      rgba(239, 237, 230, 0.06);  /* blueprint grid on ink */

  /* Brand precision accent */
  --color-brand:         #836efe;
  --color-brand-deep:    #6703ff;  /* hover state on ink-pill CTAs */

  /* Rules */
  --color-rule:          rgba(10, 10, 10, 0.14);
  --color-rule-soft:     rgba(10, 10, 10, 0.08);
  --color-rule-on-ink:   rgba(239, 237, 230, 0.18);
}
```

**Removed from v2:** orange family (`#FF6B35`, `#FFE4D6`, `#C9491E`), purple deep-surface family (`#0F0A1F` etc.), gradient-brand-deep. Anywhere `--color-accent-*` was used → replace with brand purple at the same opacity, or drop the accent entirely.

### 2.2 Typography

| Role     | Family               | Weights         | Notes                                              |
|----------|----------------------|-----------------|----------------------------------------------------|
| Display  | **Unbounded**        | 400 / 700 / 900 | Russian-designed, geometric, Cyrillic-first. All headings, big numbers, product titles. |
| Body     | **Inter**            | 400 / 500 / 700 | Workhorse. Body copy, descriptions, lead paragraphs. |
| Mono     | **JetBrains Mono**   | 400 / 500       | Lab-instrument labels, SKUs, formulas, eyebrows, ticker, page numbers, stat labels. |

All three have excellent Cyrillic, all free via Google Fonts. **No emoji icons. No icon library.** Lucide-react can stay if already imported; prefer mono-character glyphs (`→`, `↓`, `●`, `≠`) inline.

```css
:root {
  --font-display: 'Unbounded', system-ui, -apple-system, sans-serif;
  --font-body:    'Inter', system-ui, -apple-system, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, 'SF Mono', monospace;

  /* Scale */
  --text-mega:    clamp(2.75rem, 9vw, 9.5rem);  /* hero headline */
  --text-display: clamp(2.25rem, 5.5vw, 5.5rem); /* manifesto statement */
  --text-h2:      clamp(2rem, 4vw, 4rem);
  --text-body:    1.0625rem;                     /* 17px */
  --text-mono-xs: 0.6875rem;                     /* 11px */
  --text-mono-sm: 0.75rem;                       /* 12px */
}
```

**Tracking rules:**
- Display: `letter-spacing: -0.045em` (-0.06em for decimals like `4,9`)
- Mono labels: `letter-spacing: 0.06em` to `0.08em`, ALWAYS uppercase or lowercase intentionally
- Body: default tracking

**Italic discipline:** italic appears ONLY on brand-purple words. No italic in body, no italic in mono. Italic = signal.

### 2.3 Spacing & Layout

```css
:root {
  --space-section:   8rem;     /* vertical padding inside sections */
  --space-page:      1.5rem;   /* horizontal page edge */
  --max-content:     1600px;   /* hero / products inner */
  --max-narrow:      1400px;   /* manifesto inner */
}
```

**Edge-to-content rule:** sections are full-bleed, content centers within `--max-content`. Notebook header (`nb-header`) sits at `top: 1.25rem; left: 1.5rem; right: 1.5rem` — outside any inner container.

### 2.4 Motion

```ts
// web/lib/motion.ts (replaces v2 motion file)
export const EASE_OUT_QUART = 'cubic-bezier(0.25, 1, 0.5, 1)';
export const EASE_OUT_EXPO  = 'cubic-bezier(0.19, 1, 0.22, 1)';
export const TICKER_DURATION_S = 50;   // hero formula ticker
export const ROTATE_SLOW_S    = 80;    // hero benzene
export const ROTATE_GHOST_S   = 200;   // manifesto background molecule (reverse direction)
export const COUNTUP_DURATION_MS = 1800;
export const STATBAR_DURATION_S  = 1.2;
```

**Removed from v2:** spring physics (`SPRING_HEAVY`), `EASE_BOUNCE`, sticker wobble, scroll-driven parallax. Lab Notebook is calm-confident, not bouncy.

**Motion budget per page:**
- **Always:** ticker crawl, molecule rotation, mode-multiply blends
- **On scroll into view:** count-up on big numbers, stat-bar fill, manifesto cell brand-purple top-stroke
- **On hover:** Mendeleev cell tint shift, callout arrow stroke-dashoffset reveal, callout text fade, product image scale 1→1.04, chips ink-fill, formula slide-up, CTA color invert
- **Reduced motion:** all decorative animations disabled, count-up snaps to final value

### 2.5 Border radius

Pill (`999px`) for chips, CTAs, buttons. **Sharp 90° corners everywhere else** — Mendeleev cells, product images, illustration frames, page-end footer. The brutalist sharp-corner-on-everything-but-the-CTA contrast is part of the lab-instrument language.

---

## 3. Foundational Primitives

### 3.1 Notebook header (`<NotebookHeader>`)

Lives on every section. Top-left = section label with brand-purple bullet. Top-right = page-of-pages and edition.

```tsx
<NotebookHeader
  section="01"
  label="Лабораторный журнал"
  page={1}
  total={3}
  edition="Ред. 2026.04 / v3"
/>
```

Renders as:
```
●  № 001 — Лабораторный журнал           Ред. 2026.04 / v3   стр. 01 / 03
```

Mono, uppercase, `letter-spacing: 0.06em`. Always positioned `absolute; top: 1.25rem`. Color inherits from section.

### 3.2 Blueprint grid (`<GridOverlay>`)

64×64 dotted background. `--color-cream-line` on cream sections, `--color-ink-line` on ink sections. Continuous across the page — same grid scale, just colour-shifted with the surface. Sits at `z-index: 0` in section, content sits at `z-index: 2`, decorative molecules at `z-index: 1`.

### 3.3 Asymmetric rule (`<RuleAsym>`)

Thin 1px horizontal bar, NEVER full-width. Variants: `width="38%" align="left"`, `width="22%" align="right"`. Used as section divider accent. Color follows surface (`--color-rule` on cream, `--color-rule-on-ink` on ink).

### 3.4 Hand-drawn callout (`<Callout>`)

SVG path with `stroke-dasharray` initial state hidden, animates `stroke-dashoffset: 0` on parent hover. Always paired with mono lowercase text in brand-purple-deep that fades in 0.25s after the line draws. Positioned absolutely against a parent product card or image.

```tsx
<Callout
  position="top-right"
  offset="-3.5rem"
  text="161 реакция"
  curve="qbezier"     // qbezier | straight | backward
/>
```

---

## 4. Components

### 4.1 `<Section variant="cream"|"ink">`

Section wrapper. Owns: padding (`--space-section`), `position: relative; overflow: hidden`, grid overlay, notebook header slot, optional asymmetric rule slot, optional decorative molecule slot.

Auto-switches text colors based on variant. Body becomes `bone`, rules become `rule-on-ink`, etc.

**Replaces v2's `<DarkSection>`.** All v2 sites of `<DarkSection>` → `<Section variant="ink">`.

### 4.2 `<NumberCell>` (Mendeleev-style stat cell)

```tsx
<NumberCell
  index="01"
  topLabel="год"
  big="2023"                       // string OR { countTo: 20000, suffix: '+' }
  bigVariant="default"|"decimal"   // decimal tightens letter-spacing
  bottomLeft="основано"            // brand-purple atomic-mass label
  bottomRight="3 года"
>
  <Timeline points={['23','24','25','26']} active={0} />
</NumberCell>
```

`min-height: 18rem`. Always 4-column grid at desktop, 2-column at tablet, 1-column at mobile. `gap: 1.25rem`. Brand-purple top-stroke draws on hover. Border tints toward brand on hover.

### 4.3 Data viz components (slot inside `<NumberCell>`)

| Component       | Use                              | Visual |
|-----------------|----------------------------------|--------|
| `<Timeline>`    | Year-on-timeline, founding year  | Horizontal axis, brand-filled active dot, mono `'YY` labels under each |
| `<Scientific>`  | Big-number alternative notation  | Display-font `2 × 10⁴ = ЛЮДЕЙ` with brand-purple multiplier and exponent |
| `<Rating>`      | X out of N                       | N circles, X-1 fully filled brand-purple, last circle filled by `(X mod 1)` via clip-path |
| `<DotGrid>`     | Literal count visualization      | Generated grid of N small circles in `cols × rows` layout. Final dot brand-purple. |

`<DotGrid>` accepts `total`, `cols`, `dotR`, `cellW`, `cellH` props. JS-generates the SVG circles on mount.

### 4.4 `<ProductCard>`

Major rebuild from v2. Anatomy top-to-bottom:

```
┌─ pcard__head ─────────────────────────┐
│ № X-30 / Cu               [Хит]       │  mono SKU + element / pill badge
├───────────────────────────────────────┤
│ ┌─ pcard__image ─────────┐            │
│ │ arr. 01                │            │  mono corner mark
│ │   [SVG illustration]   │            │
│ │                        │            │
│ │ [formula popup]        │            │  hidden, slides up on hover
│ └────────────────────────┘            │
├───────────────────────────────────────┤
│ Химичка 3.0   ← italic brand-purple   │  display, en-em, brand on first word
│ Флагман: настоящая лаборатория …      │  body description, max-width 32ch
├─ pcard__stats ────────────────────────┤
│ 01 / реактивов     ████████   18      │  mono label / dashed bar / display value
│ 02 / инструментов  █████      12      │
│ 03 / реакций       ██████████ 161     │
├─ pcard__tags ─────────────────────────┤
│ [безопасно] [ярко] [от 10 лет]        │  Chip pills
├─ pcard__meta ─────────────────────────┤
│ 3 399 ₽            [Заказать набор →] │  display price / outlined CTA
└───────────────────────────────────────┘
```

**Asymmetric stagger rules:**
- 3-card row: `:nth-child(2) { margin-top: 4rem }; :nth-child(3) { margin-top: 8rem }`
- 4-card row: `:nth-child(2) { margin-top: 3rem }; :nth-child(3) { margin-top: 6rem }; :nth-child(4) { margin-top: 2rem }`
- Grid columns: NOT equal width — `grid-template-columns: 1.25fr 1fr 1.1fr` for 3-card row to break the rhythm

**Hover state (whole card):**
- Image border `--color-rule` → `--color-ink`
- Image art `transform: scale(1.04)`
- Formula popup slides in from below
- Callout SVG path stroke-dashoffset → 0 (draws itself)
- Callout text fades in
- All chips invert (background ink, text bone)
- CTA inverts (background ink, text bone)

### 4.5 `<StatBar>`

```tsx
<StatBar index="01" label="реактивов" value={18} fillPercent={100} />
```

3-column grid: `minmax(7.5rem, auto) 1fr 2.5rem`. Bar uses `repeating-linear-gradient(90deg, ink 0, ink 4px, transparent 4px, transparent 6px)` to render the dashed Morse-like pattern. Width animates from 0 to `fillPercent%` on scroll-in via IntersectionObserver.

**Per-stat-type max scaling** (across all visible cards in a row):
```
maxByType = { реактивов: 18, инструментов: 20, реакций: 161 }
fillPercent = (value / maxByType[type]) * 100
```

This makes the bars tell a story across cards — Электрохимичка's instrument bar maxes at 100% while its реакций bar drops to 46%, showing the product's profile at a glance.

### 4.6 `<Chip>`

Pill, mono lowercase, `0.6875rem` font, 1px ink border, transparent fill. On parent product-card hover: ink fill / bone text.

**No status / urgency variants** (we're not a marketplace). Just lowercase tags.

### 4.7 CTAs — `<Button>` + `<PCardCTA>`

Two button languages:

**Hero / global pill (`<Button>`):** `1.125rem 1.875rem` padding, ink-filled, mono uppercase 0.08em tracking, `border-radius: 999px`. Hover → brand-deep. Optional `arrow` slot. Variant `ghost` = transparent fill, ink text.

**Product card CTA (`<PCardCTA>`):** smaller `0.75rem 1.125rem` padding, ink outline, transparent fill, mono uppercase. Inverts on parent card hover (NOT on its own hover — the card is the hover surface).

### 4.8 `<Ticker>`

Horizontal infinite-scroll marquee, CSS-keyframe based. Item template: `[•] H₂O · вода`. Brand-purple dot, mono uppercase 0.08em tracking, gap `3rem` between items. Pauses on hover. Items rendered twice for seamless loop. `TICKER_DURATION_S` controls speed.

Used in: hero bottom strip. **NOT** used as a header promo bar (that was v2 — feels too marketplace-y for this brand).

### 4.9 `<MoleculeMotif>`

SVG molecule wireframes used as ambient decoration. **Never with atom labels.** Variants:

- `benzene` — single hexagon + inscribed circle + 6 outward bonds
- `anthracene` — three fused hexagons, used as manifesto background ghost
- `water` — H–O–H bent bond fragment (104.5° angle), used as small detail in hero corner
- `methane` — tetrahedral CH₄ (future use, not in concept)

Always `fill: none; stroke: currentColor; stroke-width: 1.2-1.4`. `stroke-linejoin: round; stroke-linecap: round`. On dark surfaces, currentColor inherits bone; on cream, currentColor inherits ink.

`mix-blend-mode: multiply` on cream surfaces lets headline type pass through the molecule cleanly.

### 4.10 Hero supporting detail components

- `<HeroFigtag>` — center-top mono label `FIG. 001-A — ARR. C₆H₆`, 40% opacity
- `<HeroScale>` — bottom-left ruler SVG + `scale 1 : 1 · 200 mm` mono caption
- `<HeroAnnotation>` — bottom-right `РАБОЧАЯ ОБЛАСТЬ 1080 × 1920 mm` with thin rule above
- `<HeroDetailMolecule>` — top-right small molecule fragment (water by default), 55% opacity

These are deliberately positioned in the four corners + center-top to frame the hero like a technical drawing. Mobile: hide all except the ticker and main molecule.

---

## 5. Patterns

### 5.1 Section rhythm (homepage)

```
[cream]  HERO            big headline + ticker
[ink]    MANIFESTO       statement + 4-cell number row
[cream]  CATALOG         category tiles (asymmetric)
[ink]    HOW IT WORKS    3 steps with mega numerals
[cream]  TESTIMONIALS    cards
[ink]    PRE-FOOTER CTA  mega claim + single brand-deep pill
[cream]  FOOTER          calm, mono links
```

Each cream→ink transition is a moment. No `[ink][ink]` in succession unless explicitly composed (very rare).

### 5.2 Notebook page system

Each section knows its index in the page count and renders top-right as `стр. NN / TOTAL`. On homepage: `01 / 06` (hero) → `06 / 06` (pre-footer). On other pages, count restarts.

### 5.3 Eyebrow pattern

Above every major section heading:
```
●  02.0 / Принципы лаборатории
```

Brand-purple bullet (8px circle), mono `0.75rem`, uppercase, `0.08em` tracking. Index + slash + label. This is the chapter mark in the notebook.

### 5.4 Brand-purple budget (per page)

Maximum **5 occurrences**:
1. One headline word (italic)
2. One manifesto phrase (with brand underline 5px tall, 50% opacity)
3. Hand-drawn callout strokes
4. Eyebrow bullets
5. NumberCell hover top-stroke

Forbidden: brand-purple background blocks, brand-purple gradients, brand-purple body text. Used as an accent/pointer language only.

---

## 6. Russian Language

- All UI text in Russian. Mix freely with scientific notation: `H₂O`, `2 × 10⁴`, `pH 7.0`, `→`, `↓`, `↑`.
- Number formatting: `Number.toLocaleString('ru-RU')` always. Spaces between thousands: `3 399 ₽`, `20 000+`. Use `&thinsp;` for currency price spacing.
- Decimals use comma: `4,9` (not `4.9`). Scientific notation may use period: `2.0 × 10⁴`.
- Years use prime apostrophe in mono: `'23 '24 '25 '26`.

---

## 7. Migration from v2 (what to delete / what to keep)

### Delete

- `web/components/ui/Sticker.tsx` — diamond rotated badge gone. Replace usages with `<Chip>` or remove entirely.
- `web/components/ui/HeroProductStack.tsx` — hero product stack gone (hero is type-only now).
- All v2 motion: `EASE_BOUNCE`, `SPRING_HEAVY`, sticker wobble keyframes.
- Orange CSS variables and any class using them.
- Dark surface family `#0F0A1F` etc. — replaced by single `--color-ink`.

### Keep with revisions

- `web/components/ui/Ticker.tsx` — keep, restyle item template (brand-purple dot, mono formula items).
- `web/components/ui/BigNumber.tsx` — keep, rename to `<NumberCell>` and add slot for data-viz children.
- `web/components/ui/GlassCard.tsx` — drop `dark` variant. Cream-only. Or delete entirely if no consumers remain.
- `web/components/marketing/Manifesto.tsx` — replace 4-column BigNumber grid with `<NumberCell>` row using new `<Timeline>` / `<Scientific>` / `<Rating>` / `<DotGrid>` data-viz children.
- `web/components/marketing/Hero.tsx` — major rebuild per Section 4.10 + 4.4.
- `web/components/ProductCard.tsx` — major rebuild per Section 4.4.
- `web/components/Header.tsx` — promo Ticker can stay; orange active-route underline switches to brand-purple.

### New components

- `<Section>`, `<NotebookHeader>`, `<GridOverlay>`, `<RuleAsym>`, `<Callout>`, `<MoleculeMotif>`, `<NumberCell>`, `<Timeline>`, `<Scientific>`, `<Rating>`, `<DotGrid>`, `<StatBar>`, `<Chip>`, `<HeroFigtag>`, `<HeroScale>`, `<HeroAnnotation>`, `<HeroDetailMolecule>`.

---

## 8. Stat dataset (manifesto, current)

Owner-confirmed values from 2026-04-28:

| Index | Big      | Top label  | Bottom-left   | Bottom-right | Viz                           |
|-------|----------|-----------|---------------|--------------|-------------------------------|
| 01    | 2023     | год       | основано      | 3 года       | Timeline 2023→2026, '23 active |
| 02    | 20 000+  | купили    | покупатели    | с 2023       | Scientific 2 × 10⁴ = людей    |
| 03    | 4,9      | рейтинг   | из 5          | WB & Ozon    | 5 circles, last filled 92%    |
| 04    | 161      | реакций   | в наборе      | каждая ≠     | DotGrid 161 dots, 23 × 7      |

---

## 9. Product dataset (catalog, current)

Owner-confirmed catalog from 2026-04-28:

| SKU      | Name             | Реактивов | Инструментов | Реакций | Цена   | Возраст | Chips                                | Badge |
|----------|------------------|-----------|--------------|---------|--------|---------|--------------------------------------|-------|
| X-30     | Химичка 3.0      | 18        | 12           | 161     | 3 399 ₽ | 10+   | безопасно · ярко · от 10 лет         | Хит   |
| X-MINI   | Мини-Химичка     | 18        | 4            | 161     | 1 799 ₽ | 8+    | подарок · от 8 лет                   | Старт |
| X-EL     | Электрохимичка   | 14        | 20           | 74      | 3 299 ₽ | 12+   | ток · гальваника · от 12 лет         | Pro   |

Per-stat-type max for bar scaling: `{ реактивов: 18, инструментов: 20, реакций: 161 }`.
