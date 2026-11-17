/** Turns captured bank and wallet notifications into transactions waiting in the review inbox. */
import * as Crypto from 'expo-crypto';
import { TRANSACTIONS_TABLE, accountFor, parseNotification, type Transaction } from '@dirary/shared';

import { getCaptures } from '../../modules/dirary-capture';
import { getMeta, hasFingerprint, readAccounts, saveLocal, setMeta } from './db';

const CURSOR = 'capture_cursor';

/**
 * Reads notifications captured since last time and logs the ones that clearly are transactions.
 * Each becomes a "needs review" transaction; nothing counts toward totals until you confirm it.
 * Raw notification text never leaves the phone. Returns how many were added.
 */
export async function processCaptures(): Promise<number> {
  let cursor = Number((await getMeta(CURSOR)) ?? 0);
  const accounts = await readAccounts();
  let added = 0;

  for (;;) {
    const batch = getCaptures(cursor, 200);
    if (batch.length === 0) break;
    for (const capture of batch) {
      cursor = Math.max(cursor, capture.id);
      const parsed = parseNotification(capture);
      if (!parsed || (await hasFingerprint(parsed.fingerprint))) continue;
      const stamp = new Date().toISOString();
      const row: Transaction = {
        id: Crypto.randomUUID(),
        account_id: accountFor(parsed.institution, accounts)?.id ?? null,
        category_id: null,
        amount_centavos: parsed.amount_centavos,
        direction: parsed.direction,
        merchant: parsed.merchant,
        note: null,
        occurred_at: parsed.occurred_at,
        source: 'notification',
        status: 'needs_review',
        fingerprint: parsed.fingerprint,
        transfer_group_id: null,
        fixed_expense_id: null,
        created_at: stamp,
        updated_at: stamp,
        deleted_at: null,
      };
      await saveLocal(TRANSACTIONS_TABLE, row);
      added += 1;
    }
    await setMeta(CURSOR, String(cursor));
  }
  return added;
}
