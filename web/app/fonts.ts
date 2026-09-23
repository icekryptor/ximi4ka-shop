import localFont from 'next/font/local'

// Self-hosted copies of the fonts the site used to pull through
// next/font/google. That loader downloads from Google during `next build`, and
// from our network (the Moscow VPS included) the request fails often enough to
// break deploys. The .woff2 files in public/fonts/<family>/ are the exact
// files Google Fonts served — variable fonts cut into Google's unicode-range
// subsets (OFL, licence next to each family) — so glyphs stay byte-identical.
//
// One localFont() call per subset, because next/font/local applies
// `declarations` to every file of a call and unicode-range has to differ per
// file. Every call of a family:
//   - names the face exactly like Google did ('Inter', not a generated name),
//     so all subset files form one family;
//   - lists that name again in `fallback`: Turbopack (Next 16.2) still puts the
//     generated name ("interLatin") first in the `variable` value even when
//     `declarations` sets font-family. No face is called "interLatin", so the
//     browser skips it and lands on 'Inter';
//   - declares one @font-face per weight on the same variable file, like
//     Google's CSS — a weight that is not listed snaps to the nearest one
//     instead of being rendered from the wght axis;
//   - sets the family's `variable`, so every call is referenced and its CSS
//     lands in the bundle (the class list goes on <html>); whichever class
//     wins, the value resolves to the same family;
//   - skips the generated metric fallback: the '<Family> Fallback' faces live
//     in globals.css with the numbers next/font/google computed.
// Only latin + cyrillic are preloaded, as before; the other subsets download
// only when a page contains such characters (₽ is latin-ext, for instance).

// IBM Plex Sans — body copy (globals.css: --font-sans → --font-plex).
const plexSansCyrillicExt = localFont({
  src: [
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-cyrillic-ext.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-cyrillic-ext.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-cyrillic-ext.woff2', weight: '600', style: 'normal' },
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-cyrillic-ext.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'IBM Plex Sans' },
    { prop: 'font-stretch', value: '100%' },
    { prop: 'unicode-range', value: 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F' },
  ],
  variable: '--font-plex',
  fallback: ["'IBM Plex Sans'", "'IBM Plex Sans Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const plexSansCyrillic = localFont({
  src: [
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-cyrillic.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-cyrillic.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-cyrillic.woff2', weight: '600', style: 'normal' },
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-cyrillic.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'IBM Plex Sans' },
    { prop: 'font-stretch', value: '100%' },
    { prop: 'unicode-range', value: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' },
  ],
  variable: '--font-plex',
  fallback: ["'IBM Plex Sans'", "'IBM Plex Sans Fallback'"],
  adjustFontFallback: false,
  preload: true,
})
const plexSansGreek = localFont({
  src: [
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-greek.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-greek.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-greek.woff2', weight: '600', style: 'normal' },
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-greek.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'IBM Plex Sans' },
    { prop: 'font-stretch', value: '100%' },
    { prop: 'unicode-range', value: 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF' },
  ],
  variable: '--font-plex',
  fallback: ["'IBM Plex Sans'", "'IBM Plex Sans Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const plexSansVietnamese = localFont({
  src: [
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-vietnamese.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-vietnamese.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-vietnamese.woff2', weight: '600', style: 'normal' },
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-vietnamese.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'IBM Plex Sans' },
    { prop: 'font-stretch', value: '100%' },
    { prop: 'unicode-range', value: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB' },
  ],
  variable: '--font-plex',
  fallback: ["'IBM Plex Sans'", "'IBM Plex Sans Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const plexSansLatinExt = localFont({
  src: [
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-latin-ext.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-latin-ext.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-latin-ext.woff2', weight: '600', style: 'normal' },
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-latin-ext.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'IBM Plex Sans' },
    { prop: 'font-stretch', value: '100%' },
    { prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  ],
  variable: '--font-plex',
  fallback: ["'IBM Plex Sans'", "'IBM Plex Sans Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const plexSansLatin = localFont({
  src: [
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-latin.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-latin.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-latin.woff2', weight: '600', style: 'normal' },
    { path: '../public/fonts/ibm-plex-sans/ibm-plex-sans-latin.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'IBM Plex Sans' },
    { prop: 'font-stretch', value: '100%' },
    { prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  ],
  variable: '--font-plex',
  fallback: ["'IBM Plex Sans'", "'IBM Plex Sans Fallback'"],
  adjustFontFallback: false,
  preload: true,
})

// Roboto Mono — Tailwind's `font-mono` (globals.css: --font-mono → --font-mono-google).
const robotoMonoCyrillicExt = localFont({
  src: [
    { path: '../public/fonts/roboto-mono/roboto-mono-cyrillic-ext.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/roboto-mono/roboto-mono-cyrillic-ext.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/roboto-mono/roboto-mono-cyrillic-ext.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'Roboto Mono' },
    { prop: 'unicode-range', value: 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F' },
  ],
  variable: '--font-mono-google',
  fallback: ["'Roboto Mono'", "'Roboto Mono Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const robotoMonoCyrillic = localFont({
  src: [
    { path: '../public/fonts/roboto-mono/roboto-mono-cyrillic.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/roboto-mono/roboto-mono-cyrillic.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/roboto-mono/roboto-mono-cyrillic.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'Roboto Mono' },
    { prop: 'unicode-range', value: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' },
  ],
  variable: '--font-mono-google',
  fallback: ["'Roboto Mono'", "'Roboto Mono Fallback'"],
  adjustFontFallback: false,
  preload: true,
})
const robotoMonoGreek = localFont({
  src: [
    { path: '../public/fonts/roboto-mono/roboto-mono-greek.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/roboto-mono/roboto-mono-greek.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/roboto-mono/roboto-mono-greek.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'Roboto Mono' },
    { prop: 'unicode-range', value: 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF' },
  ],
  variable: '--font-mono-google',
  fallback: ["'Roboto Mono'", "'Roboto Mono Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const robotoMonoVietnamese = localFont({
  src: [
    { path: '../public/fonts/roboto-mono/roboto-mono-vietnamese.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/roboto-mono/roboto-mono-vietnamese.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/roboto-mono/roboto-mono-vietnamese.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'Roboto Mono' },
    { prop: 'unicode-range', value: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB' },
  ],
  variable: '--font-mono-google',
  fallback: ["'Roboto Mono'", "'Roboto Mono Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const robotoMonoLatinExt = localFont({
  src: [
    { path: '../public/fonts/roboto-mono/roboto-mono-latin-ext.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/roboto-mono/roboto-mono-latin-ext.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/roboto-mono/roboto-mono-latin-ext.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'Roboto Mono' },
    { prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  ],
  variable: '--font-mono-google',
  fallback: ["'Roboto Mono'", "'Roboto Mono Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const robotoMonoLatin = localFont({
  src: [
    { path: '../public/fonts/roboto-mono/roboto-mono-latin.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/roboto-mono/roboto-mono-latin.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/roboto-mono/roboto-mono-latin.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'Roboto Mono' },
    { prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  ],
  variable: '--font-mono-google',
  fallback: ["'Roboto Mono'", "'Roboto Mono Fallback'"],
  adjustFontFallback: false,
  preload: true,
})

// Unbounded — lj display headings (--font-lj-display).
const unboundedCyrillicExt = localFont({
  src: [
    { path: '../public/fonts/unbounded/unbounded-cyrillic-ext.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/unbounded/unbounded-cyrillic-ext.woff2', weight: '700', style: 'normal' },
    { path: '../public/fonts/unbounded/unbounded-cyrillic-ext.woff2', weight: '900', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'Unbounded' },
    { prop: 'unicode-range', value: 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F' },
  ],
  variable: '--font-lj-display',
  fallback: ["'Unbounded'", "'Unbounded Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const unboundedCyrillic = localFont({
  src: [
    { path: '../public/fonts/unbounded/unbounded-cyrillic.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/unbounded/unbounded-cyrillic.woff2', weight: '700', style: 'normal' },
    { path: '../public/fonts/unbounded/unbounded-cyrillic.woff2', weight: '900', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'Unbounded' },
    { prop: 'unicode-range', value: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' },
  ],
  variable: '--font-lj-display',
  fallback: ["'Unbounded'", "'Unbounded Fallback'"],
  adjustFontFallback: false,
  preload: true,
})
const unboundedVietnamese = localFont({
  src: [
    { path: '../public/fonts/unbounded/unbounded-vietnamese.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/unbounded/unbounded-vietnamese.woff2', weight: '700', style: 'normal' },
    { path: '../public/fonts/unbounded/unbounded-vietnamese.woff2', weight: '900', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'Unbounded' },
    { prop: 'unicode-range', value: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB' },
  ],
  variable: '--font-lj-display',
  fallback: ["'Unbounded'", "'Unbounded Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const unboundedLatinExt = localFont({
  src: [
    { path: '../public/fonts/unbounded/unbounded-latin-ext.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/unbounded/unbounded-latin-ext.woff2', weight: '700', style: 'normal' },
    { path: '../public/fonts/unbounded/unbounded-latin-ext.woff2', weight: '900', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'Unbounded' },
    { prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  ],
  variable: '--font-lj-display',
  fallback: ["'Unbounded'", "'Unbounded Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const unboundedLatin = localFont({
  src: [
    { path: '../public/fonts/unbounded/unbounded-latin.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/unbounded/unbounded-latin.woff2', weight: '700', style: 'normal' },
    { path: '../public/fonts/unbounded/unbounded-latin.woff2', weight: '900', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'Unbounded' },
    { prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  ],
  variable: '--font-lj-display',
  fallback: ["'Unbounded'", "'Unbounded Fallback'"],
  adjustFontFallback: false,
  preload: true,
})

// Inter — lj body copy (--font-lj-body).
const interCyrillicExt = localFont({
  src: [
    { path: '../public/fonts/inter/inter-cyrillic-ext.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/inter/inter-cyrillic-ext.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/inter/inter-cyrillic-ext.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'Inter' },
    { prop: 'unicode-range', value: 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F' },
  ],
  variable: '--font-lj-body',
  fallback: ["'Inter'", "'Inter Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const interCyrillic = localFont({
  src: [
    { path: '../public/fonts/inter/inter-cyrillic.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/inter/inter-cyrillic.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/inter/inter-cyrillic.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'Inter' },
    { prop: 'unicode-range', value: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' },
  ],
  variable: '--font-lj-body',
  fallback: ["'Inter'", "'Inter Fallback'"],
  adjustFontFallback: false,
  preload: true,
})
const interGreekExt = localFont({
  src: [
    { path: '../public/fonts/inter/inter-greek-ext.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/inter/inter-greek-ext.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/inter/inter-greek-ext.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'Inter' },
    { prop: 'unicode-range', value: 'U+1F00-1FFF' },
  ],
  variable: '--font-lj-body',
  fallback: ["'Inter'", "'Inter Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const interGreek = localFont({
  src: [
    { path: '../public/fonts/inter/inter-greek.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/inter/inter-greek.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/inter/inter-greek.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'Inter' },
    { prop: 'unicode-range', value: 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF' },
  ],
  variable: '--font-lj-body',
  fallback: ["'Inter'", "'Inter Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const interVietnamese = localFont({
  src: [
    { path: '../public/fonts/inter/inter-vietnamese.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/inter/inter-vietnamese.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/inter/inter-vietnamese.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'Inter' },
    { prop: 'unicode-range', value: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB' },
  ],
  variable: '--font-lj-body',
  fallback: ["'Inter'", "'Inter Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const interLatinExt = localFont({
  src: [
    { path: '../public/fonts/inter/inter-latin-ext.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/inter/inter-latin-ext.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/inter/inter-latin-ext.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'Inter' },
    { prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  ],
  variable: '--font-lj-body',
  fallback: ["'Inter'", "'Inter Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const interLatin = localFont({
  src: [
    { path: '../public/fonts/inter/inter-latin.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/inter/inter-latin.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/inter/inter-latin.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'Inter' },
    { prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  ],
  variable: '--font-lj-body',
  fallback: ["'Inter'", "'Inter Fallback'"],
  adjustFontFallback: false,
  preload: true,
})

// JetBrains Mono — lj mono labels (--font-lj-mono). 600 is not in the lj type
// scale, but pages do render it: until 09.2026 a second JetBrains Mono instance
// for /v3-preview-c shipped the 600 face under the same family name.
const jetbrainsMonoCyrillicExt = localFont({
  src: [
    { path: '../public/fonts/jetbrains-mono/jetbrains-mono-cyrillic-ext.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/jetbrains-mono/jetbrains-mono-cyrillic-ext.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/jetbrains-mono/jetbrains-mono-cyrillic-ext.woff2', weight: '600', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'JetBrains Mono' },
    { prop: 'unicode-range', value: 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F' },
  ],
  variable: '--font-lj-mono',
  fallback: ["'JetBrains Mono'", "'JetBrains Mono Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const jetbrainsMonoCyrillic = localFont({
  src: [
    { path: '../public/fonts/jetbrains-mono/jetbrains-mono-cyrillic.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/jetbrains-mono/jetbrains-mono-cyrillic.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/jetbrains-mono/jetbrains-mono-cyrillic.woff2', weight: '600', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'JetBrains Mono' },
    { prop: 'unicode-range', value: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' },
  ],
  variable: '--font-lj-mono',
  fallback: ["'JetBrains Mono'", "'JetBrains Mono Fallback'"],
  adjustFontFallback: false,
  preload: true,
})
const jetbrainsMonoGreek = localFont({
  src: [
    { path: '../public/fonts/jetbrains-mono/jetbrains-mono-greek.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/jetbrains-mono/jetbrains-mono-greek.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/jetbrains-mono/jetbrains-mono-greek.woff2', weight: '600', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'JetBrains Mono' },
    { prop: 'unicode-range', value: 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF' },
  ],
  variable: '--font-lj-mono',
  fallback: ["'JetBrains Mono'", "'JetBrains Mono Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const jetbrainsMonoVietnamese = localFont({
  src: [
    { path: '../public/fonts/jetbrains-mono/jetbrains-mono-vietnamese.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/jetbrains-mono/jetbrains-mono-vietnamese.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/jetbrains-mono/jetbrains-mono-vietnamese.woff2', weight: '600', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'JetBrains Mono' },
    { prop: 'unicode-range', value: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB' },
  ],
  variable: '--font-lj-mono',
  fallback: ["'JetBrains Mono'", "'JetBrains Mono Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const jetbrainsMonoLatinExt = localFont({
  src: [
    { path: '../public/fonts/jetbrains-mono/jetbrains-mono-latin-ext.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/jetbrains-mono/jetbrains-mono-latin-ext.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/jetbrains-mono/jetbrains-mono-latin-ext.woff2', weight: '600', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'JetBrains Mono' },
    { prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  ],
  variable: '--font-lj-mono',
  fallback: ["'JetBrains Mono'", "'JetBrains Mono Fallback'"],
  adjustFontFallback: false,
  preload: false,
})
const jetbrainsMonoLatin = localFont({
  src: [
    { path: '../public/fonts/jetbrains-mono/jetbrains-mono-latin.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/jetbrains-mono/jetbrains-mono-latin.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/jetbrains-mono/jetbrains-mono-latin.woff2', weight: '600', style: 'normal' },
  ],
  declarations: [
    { prop: 'font-family', value: 'JetBrains Mono' },
    { prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  ],
  variable: '--font-lj-mono',
  fallback: ["'JetBrains Mono'", "'JetBrains Mono Fallback'"],
  adjustFontFallback: false,
  preload: true,
})

export const fontVariables = [
  plexSansCyrillicExt,
  plexSansCyrillic,
  plexSansGreek,
  plexSansVietnamese,
  plexSansLatinExt,
  plexSansLatin,
  robotoMonoCyrillicExt,
  robotoMonoCyrillic,
  robotoMonoGreek,
  robotoMonoVietnamese,
  robotoMonoLatinExt,
  robotoMonoLatin,
  unboundedCyrillicExt,
  unboundedCyrillic,
  unboundedVietnamese,
  unboundedLatinExt,
  unboundedLatin,
  interCyrillicExt,
  interCyrillic,
  interGreekExt,
  interGreek,
  interVietnamese,
  interLatinExt,
  interLatin,
  jetbrainsMonoCyrillicExt,
  jetbrainsMonoCyrillic,
  jetbrainsMonoGreek,
  jetbrainsMonoVietnamese,
  jetbrainsMonoLatinExt,
  jetbrainsMonoLatin,
].map((font) => font.variable).join(' ')
