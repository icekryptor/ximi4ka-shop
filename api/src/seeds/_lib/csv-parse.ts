import { parse } from 'csv-parse/sync'

export type TildaRow = Record<string, string>

// Thin wrapper around csv-parse tuned for Tilda exports:
// - semicolon delimiter
// - first row is the header
// - skip blank lines (Tilda CSVs sometimes end with a blank row)
// - relax_quotes lets us survive minor quoting glitches
export function parseTildaCsv(input: string): TildaRow[] {
  const records = parse(input, {
    columns: true,
    delimiter: ';',
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
    trim: false,
  }) as TildaRow[]
  return records
}
