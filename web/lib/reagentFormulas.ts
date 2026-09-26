/**
 * Химические формулы реактивов для чипа в строке списка каталога (Figma
 * 56:10373: фиолетовая плашка «Al₂(SO₄)₃» перед названием). Отдельного поля
 * формулы у товара нет, а артикулы вроде «FECL3» не восстанавливают регистр
 * (Co или CO), поэтому формулы заданы вручную по слагу. Смеси, индикаторы
 * без короткой формулы и наборы («Три кислоты») сознательно не указаны —
 * у них чипа нет.
 */
const FORMULAS: Record<string, string> = {
  'sulfat-alyuminiya': 'Al₂(SO₄)₃',
  'nitrat-serebra': 'AgNO₃',
  'hlorid-bariya': 'BaCl₂',
  'sulfat-medi-ii': 'CuSO₄',
  'sulfat-zheleza-ii': 'FeSO₄',
  'hlorid-zheleza-iii': 'FeCl₃',
  'gidroksid-natriya': 'NaOH',
  'sernaya-kislota': 'H₂SO₄',
  'permanganat-kaliya': 'KMnO₄',
  'dihromat-kaliya': 'K₂Cr₂O₇',
  'fosfat-kaliya': 'K₃PO₄',
  'iodid-kaliya': 'KI',
  'iodat-kaliya': 'KIO₃',
  'kristallicheskaya-sera': 'S',
  'karbonat-ammoniya': '(NH₄)₂CO₃',
  'nitrat-nikelya': 'Ni(NO₃)₂',
  'sulfat-kobalta': 'CoSO₄',
  'gidrosulfat-natriya': 'NaHSO₄',
  fenolftalein: 'C₂₀H₁₄O₄',
  'tsink-v-granulah': 'Zn',
  magnii: 'Mg',
  'zhelezo-v-poroshke': 'Fe',
  'zheleznaya-vata': 'Fe',
  'azotnaya-kislota-10': 'HNO₃',
  'sulfit-natriya': 'Na₂SO₃',
  'hlorid-olova-ii': 'SnCl₂',
  'solyanaya-kislota': 'HCl',
  'hlorid-kaltsiya-poroshok': 'CaCl₂',
  'bromid-natriya': 'NaBr',
  'rastvor-ammiaka': 'NH₃',
  'tiosulfat-natriya': 'Na₂S₂O₃',
  'karbonat-kaliya': 'K₂CO₃',
  'gidroksid-kaltsiya': 'Ca(OH)₂',
  'hlorid-kaltsiya-rastvor': 'CaCl₂',
  'geksatsianoferrat-kaliya-iii': 'K₃[Fe(CN)₆]',
  'alyuminii-granuli': 'Al',
  'oksid-magniya': 'MgO',
  'oksid-medi': 'CuO',
  'perekis-vodoroda': 'H₂O₂',
  'oksid-kremniya': 'SiO₂',
}

export function formulaForSlug(slug: string): string | null {
  return FORMULAS[slug] ?? null
}
