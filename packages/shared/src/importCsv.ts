/** Reading a bank or wallet statement saved as CSV, for the monthly reconcile. */
import { parseAmount, type TransactionDraft } from './money';

/** Splits CSV text into rows of cells. Handles quoted cells, commas and line breaks inside quotes, and "" as an escaped quote. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Reads the date formats statements commonly use. dayFirst picks 17/11/2026 over 11/17/2026. Returns local noon, or null. */
export function parseStatementDate(text: string, dayFirst = false): Date | null {
  const t = text.trim();
  let y: number, m: number, d: number;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else if ((hit = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(t))) {
    const [a, b] = [Number(hit[1]), Number(hit[2])];
    y = Number(hit[3]) < 100 ? 2000 + Number(hit[3]) : Number(hit[3]);
    [m, d] = dayFirst || a > 12 ? [b, a] : [a, b];
  } else if ((hit = /^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ ,-]+(\d{4})/.exec(t))) {
    [y, m, d] = [Number(hit[3]), MONTHS.indexOf(hit[2]!.toLowerCase()) + 1, Number(hit[1])];
  } else if ((hit = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/.exec(t))) {
    [y, m, d] = [Number(hit[3]), MONTHS.indexOf(hit[1]!.toLowerCase()) + 1, Number(hit[2])];
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d, 12, 0, 0);
  return date.getMonth() === m - 1 ? date : null;
}

export interface CsvMapping {
  date: number;
  description: number;
  /** One signed amount column (negative = money out)… */
  amount?: number;
  /** …or separate money-out and money-in columns. */
  debit?: number;
  credit?: number;
  dayFirst?: boolean;
}

/** Guesses which columns are which from the header row. */
export function guessMapping(header: readonly string[]): Partial<CsvMapping> {
  const find = (pattern: RegExp) => { const i = header.findIndex((h) => pattern.test(h)); return i < 0 ? undefined : i; };
  return {
    date: find(/date|posted|time/i),
    description: find(/desc|particular|detail|narrat|merchant|remark|transaction$/i),
    amount: find(/^amount|^amt/i),
    debit: find(/debit|withdraw|money out|paid out/i),
    credit: find(/credit|deposit|money in|paid in/i),
  };
}

export interface ImportedRow extends TransactionDraft { fingerprint: string }

/** Turns statement rows into transactions for one account. Rows it can't read are counted, not guessed. */
export function rowsToTransactions(rows: readonly string[][], mapping: CsvMapping, accountId: string): { ok: ImportedRow[]; skipped: number } {
  const ok: ImportedRow[] = [];
  let skipped = 0;
  const seen = new Map<string, number>();
  for (const row of rows) {
    const date = parseStatementDate(row[mapping.date] ?? '', mapping.dayFirst);
    const description = (row[mapping.description] ?? '').slice(0, 120);
    let centavos: number | null = null;
    let direction: 'in' | 'out' = 'out';
    if (mapping.amount !== undefined) {
      const raw = (row[mapping.amount] ?? '').trim();
      const negative = /^\(.*\)$/.test(raw) || /^[-−]/.test(raw) || /[-−]$/.test(raw);
      centavos = parseAmount(raw.replace(/[()+\-−]/g, ''));
      direction = negative ? 'out' : 'in';
    } else {
      const debit = parseAmount((row[mapping.debit ?? -1] ?? '').replace(/[()+\-−]/g, ''));
      const credit = parseAmount((row[mapping.credit ?? -1] ?? '').replace(/[()+\-−]/g, ''));
      if (debit) { centavos = debit; direction = 'out'; } else if (credit) { centavos = credit; direction = 'in'; }
    }
    if (!date || !centavos) { skipped += 1; continue; }
    // Two identical lines on one statement are two real transactions, so number the repeats.
    const key = `import|${accountId}|${date.toISOString().slice(0, 10)}|${direction}|${centavos}|${description.toLowerCase()}`;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    ok.push({ account_id: accountId, category_id: null, amount_centavos: centavos, direction, merchant: description || null, note: null, occurred_at: date.toISOString(), fingerprint: `${key}|${count}` });
  }
  return { ok, skipped };
}
