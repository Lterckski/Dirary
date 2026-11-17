/**
 * Turning a bank or e-wallet notification into a transaction.
 *
 * This is a best-effort first reader, written before any real notifications were collected.
 * It only trusts what it can see plainly (an amount and a direction word), and everything it
 * produces goes to the review inbox, never straight into your totals. Once capture mode has
 * collected real samples, each app gets its own exact reader.
 */
import type { Account, Institution } from './money';
import { parseAmount } from './money';

export interface CapturedNotification {
  /** Android package name of the app that posted it. */
  packageName: string;
  title: string;
  text: string;
  /** Milliseconds since epoch. */
  postedAt: number;
}

export interface ParsedNotification {
  institution: Institution;
  amount_centavos: number;
  direction: 'in' | 'out';
  merchant: string | null;
  reference: string | null;
  occurred_at: string;
  fingerprint: string;
}

/** Package-name keywords, so the exact package id doesn't need to be known in advance. */
export const CAPTURE_KEYWORDS: Record<Exclude<Institution, 'cash' | 'other'>, string[]> = {
  gcash: ['gcash'],
  gotyme: ['gotyme'],
  securitybank: ['securitybank', 'secbank', 'sbol'],
};
export const DEFAULT_CAPTURE_KEYWORDS = Object.values(CAPTURE_KEYWORDS).flat();

export function institutionOf(packageName: string): Institution | null {
  const name = packageName.toLowerCase();
  for (const [institution, words] of Object.entries(CAPTURE_KEYWORDS)) {
    if (words.some((w) => name.includes(w))) return institution as Institution;
  }
  return null;
}

const AMOUNT = /(?:php|₱|\bp)\s?(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*\.\d{2})\s?(?:php|pesos)/i;
const IN_WORDS = /\b(received|credited|cash[- ]?in|deposit(?:ed)?|refund(?:ed)?|sent you|added to)\b/i;
const OUT_WORDS = /\b(paid|payment|sent|debited|purchase|spent|withdr[ae]w\w*|transferred|transfer to|charged|bought|cash[- ]?out)\b/i;
const NOT_MONEY = /\b(otp|one[- ]time|verification code|authenticat\w+|log(?:ged)? ?in|promo|voucher|cashback offer|reminder|due on)\b/i;
const REFERENCE = /\bref(?:erence)?\.?\s*(?:no\.?|number|#)?\s*:?\s*([A-Z0-9]{6,})/i;
const MERCHANT = /\b(?:to|at|from)\s+([A-Z0-9][\w&'.\- ]{1,40}?)(?=\s+(?:on|with|via|ref|using|for)\b|[.,;]|$)/;

/** Returns null unless the notification clearly states an amount and whether money came in or went out. */
export function parseNotification(n: CapturedNotification): ParsedNotification | null {
  const institution = institutionOf(n.packageName);
  if (!institution) return null;
  const body = `${n.title}. ${n.text}`.replace(/\s+/g, ' ');
  if (NOT_MONEY.test(body)) return null;

  const amount = AMOUNT.exec(body);
  const centavos = amount ? parseAmount(amount[1] ?? amount[2] ?? '') : null;
  if (!centavos) return null;

  const cameIn = IN_WORDS.test(body);
  const wentOut = OUT_WORDS.test(body);
  if (cameIn === wentOut) {
    // Neither, or both ("You received ... sent by"): take whichever word appears first, or give up.
    const i = body.search(IN_WORDS);
    const o = body.search(OUT_WORDS);
    if (i < 0 && o < 0) return null;
  }
  const direction: 'in' | 'out' = cameIn && (!wentOut || body.search(IN_WORDS) < body.search(OUT_WORDS)) ? 'in' : 'out';

  const reference = REFERENCE.exec(body)?.[1] ?? null;
  const merchant = MERCHANT.exec(body)?.[1]?.trim() ?? null;
  // Same reference = same transaction. Without one, the same amount and direction within two minutes counts as a repeat.
  const fingerprint = reference
    ? `${institution}|ref|${reference.toUpperCase()}`
    : `${institution}|${centavos}|${direction}|${Math.floor(n.postedAt / 120_000)}`;

  return { institution, amount_centavos: centavos, direction, merchant, reference, occurred_at: new Date(n.postedAt).toISOString(), fingerprint };
}

/** The account a parsed notification belongs to: the first of yours at that bank or wallet. */
export function accountFor(institution: Institution, accounts: readonly Account[]): Account | null {
  return accounts.filter((a) => a.deleted_at === null).sort((a, b) => a.sort_order - b.sort_order).find((a) => a.institution === institution) ?? null;
}
