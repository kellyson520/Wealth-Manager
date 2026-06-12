import { getDatabase } from '../database/database';
import { captureError } from '../logger/logger';

interface BillRow {
  id: string;
  amount: number;
  category?: string;
  tags?: string;
  merchant: string;
  raw_description?: string;
  date: string;
  note?: string;
  type: string;
  source?: string;
  created_at: string;
  hash?: string;
  prev_hash?: string;
}

const encoder = new TextEncoder();
const HASH_CHAIN_KEY_ENV = 'WEALTH_MANAGER_HASHCHAIN_KEY';

type WebCryptoApi = Crypto;

function getWebCrypto(): WebCryptoApi | null {
  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    return globalThis.crypto;
  }

  try {
    const nodeCrypto = require('crypto') as { webcrypto?: WebCryptoApi };
    if (nodeCrypto.webcrypto?.subtle) {
      return nodeCrypto.webcrypto;
    }
  } catch {
    captureError('HashChain.getWebCrypto', new Error('Node crypto unavailable'), 'WebCrypto fallback not available in this runtime');
  }

  return null;
}

function getHashChainSecret(): string {
  const env = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;

  const secret = env?.[HASH_CHAIN_KEY_ENV] || env?.EXPO_PUBLIC_WEALTH_MANAGER_HASHCHAIN_KEY;
  if (!secret) {
    throw new Error(`Missing required env var ${HASH_CHAIN_KEY_ENV}. Set it before using hashchain functions.`);
  }
  return secret;
}

async function ensureHashColumns(db: Awaited<ReturnType<typeof getDatabase>>): Promise<void> {
  try {
    await db.execAsync(`ALTER TABLE bills ADD COLUMN hash TEXT DEFAULT ''`);
  } catch {
    captureError('HashChain.ensureHashColumns', new Error('ALTER TABLE hash'), 'hash column may already exist');
  }
  try {
    await db.execAsync(`ALTER TABLE bills ADD COLUMN prev_hash TEXT DEFAULT ''`);
  } catch {
    captureError('HashChain.ensureHashColumns', new Error('ALTER TABLE prev_hash'), 'prev_hash column may already exist');
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
}

function normalizeTags(tags?: string): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed.map((tag) => String(tag)) : [];
  } catch {
    captureError('HashChain.normalizeTags', new Error('JSON parse failed'), 'Failed to parse tags string');
    return [];
  }
}

function buildCanonicalBillPayload(bill: BillRow, prevHash: string): string {
  return stableStringify({
    amount: bill.amount,
    category: bill.category || '',
    created_at: bill.created_at,
    date: bill.date,
    id: bill.id,
    merchant: bill.merchant || '',
    note: bill.note || '',
    prev_hash: prevHash,
    raw_description: bill.raw_description || '',
    source: bill.source || '',
    tags: normalizeTags(bill.tags),
    type: bill.type,
  });
}

async function importHmacKey(webCrypto: WebCryptoApi, secret: string): Promise<CryptoKey> {
  return webCrypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function computeBillHash(bill: BillRow, prevHash: string): Promise<string> {
  const webCrypto = getWebCrypto();
  if (!webCrypto?.subtle) {
    throw new Error('WebCrypto HMAC unavailable');
  }

  const payload = buildCanonicalBillPayload(bill, prevHash);
  const key = await importHmacKey(webCrypto, getHashChainSecret());
  const signature = await webCrypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function generateHashForBill(billId: string, prevBillId?: string): Promise<boolean> {
  const db = await getDatabase();
  await ensureHashColumns(db);

  try {
    const bill = await db.getFirstAsync<BillRow>(
      'SELECT * FROM bills WHERE id = ?', [billId]
    );
    if (!bill) return false;

    let prevHash = '';
    if (prevBillId) {
      const prev = await db.getFirstAsync<{ hash: string }>(
        'SELECT hash FROM bills WHERE id = ?', [prevBillId]
      );
      if (prev) prevHash = prev.hash;
    } else {
      const prev = await db.getFirstAsync<{ hash: string }>(
        `SELECT hash FROM bills
         WHERE created_at < ? OR (created_at = ? AND id < ?)
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [bill.created_at, bill.created_at, bill.id]
      );
      if (prev) prevHash = prev.hash || '';
    }

    const hash = await computeBillHash(bill, prevHash);
    await db.runAsync(
      'UPDATE bills SET hash = ?, prev_hash = ? WHERE id = ?',
      [hash, prevHash, billId]
    );
    return true;
  } catch (e) {
    captureError('HashChain.generateHashForBill', e, 'Failed to generate hash');
    return false;
  }
}

export async function rebuildHashChain(): Promise<{ success: boolean; verified: number; broken: number; fixed: number }> {
  const db = await getDatabase();
  await ensureHashColumns(db);

  try {
    const bills = await db.getAllAsync<BillRow>(
      'SELECT * FROM bills ORDER BY created_at ASC, id ASC'
    );

    let prevHash = '';
    let verified = 0;
    let broken = 0;
    let fixed = 0;

    for (const bill of bills) {
      const expectedHash = await computeBillHash(bill, prevHash);
      if (bill.hash && bill.hash === expectedHash) {
        verified++;
      } else {
        broken++;
        await db.runAsync(
          'UPDATE bills SET hash = ?, prev_hash = ? WHERE id = ?',
          [expectedHash, prevHash, bill.id]
        );
        fixed++;
      }
      prevHash = expectedHash;
    }

    return { success: true, verified, broken, fixed };
  } catch (e) {
    captureError('HashChain.rebuildHashChain', e, 'Failed to rebuild hash chain');
    return { success: false, verified: 0, broken: 0, fixed: 0 };
  }
}

export async function verifyHashChain(): Promise<{
  valid: boolean;
  totalBills: number;
  verifiedCount: number;
  firstBrokenIndex: number;
  firstBrokenBillId: string | null;
  details: string[];
}> {
  const db = await getDatabase();
  await ensureHashColumns(db);

  try {
    const bills = await db.getAllAsync<BillRow>(
      'SELECT * FROM bills ORDER BY created_at ASC, id ASC'
    );

    if (bills.length === 0) {
      return { valid: true, totalBills: 0, verifiedCount: 0, firstBrokenIndex: -1, firstBrokenBillId: null, details: ['没有账单记录'] };
    }

    let prevHash = '';
    let verifiedCount = 0;
    let firstBrokenIndex = -1;
    let firstBrokenBillId: string | null = null;
    const details: string[] = [];

    for (let i = 0; i < bills.length; i++) {
      const bill = bills[i];
      const expectedHash = await computeBillHash(bill, prevHash);

      if (bill.hash && bill.hash === expectedHash) {
        verifiedCount++;
      } else {
        if (firstBrokenIndex === -1) {
          firstBrokenIndex = i;
          firstBrokenBillId = bill.id;
        }
        details.push(
          `[断裂#${i}] ${bill.id} ${bill.date} ${bill.merchant} ¥${bill.amount} ` +
          `期望哈希: ${expectedHash.slice(0, 16)}... 实际: ${(bill.hash || '(空)').slice(0, 16)}...`
        );
      }
      prevHash = expectedHash;
    }

    return {
      valid: firstBrokenIndex === -1,
      totalBills: bills.length,
      verifiedCount,
      firstBrokenIndex,
      firstBrokenBillId,
      details: details.slice(0, 20),
    };
  } catch (e) {
    captureError('HashChain.verifyHashChain', e, 'Failed to verify hash chain');
    return { valid: false, totalBills: 0, verifiedCount: 0, firstBrokenIndex: -1, firstBrokenBillId: null, details: [`验证出错: ${e}`] };
  }
}
