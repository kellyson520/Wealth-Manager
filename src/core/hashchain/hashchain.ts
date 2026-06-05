import { getDatabase } from '../database/database';
import { captureError } from '../logger/logger';

interface BillRow {
  id: string;
  date: string;
  amount: number;
  merchant: string;
  type: string;
  created_at: string;
  hash?: string;
  prev_hash?: string;
}

async function ensureHashColumns(db: Awaited<ReturnType<typeof getDatabase>>): Promise<void> {
  try {
    await db.execAsync(`ALTER TABLE bills ADD COLUMN hash TEXT DEFAULT ''`);
  } catch { /* column may already exist */ }
  try {
    await db.execAsync(`ALTER TABLE bills ADD COLUMN prev_hash TEXT DEFAULT ''`);
  } catch { /* column may already exist */ }
}

function sha256(str: string): string {
  const chars = str.split('');
  const len = chars.length;
  const bits = len * 8;

  const msg = chars.map((c) => c.charCodeAt(0));
  msg.push(0x80);
  while ((msg.length * 8) % 512 !== 448) {
    msg.push(0x00);
  }

  const bitLen = bits.toString(16).padStart(16, '0');
  for (let i = 14; i >= 0; i -= 2) {
    msg.push(parseInt(bitLen.substring(i, i + 2), 16));
  }

  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  for (let i = 0; i < msg.length; i += 64) {
    const W = new Array(64);
    for (let t = 0; t < 16; t++) {
      W[t] = (msg[i + t * 4] << 24) | (msg[i + t * 4 + 1] << 16) | (msg[i + t * 4 + 2] << 8) | msg[i + t * 4 + 3];
    }

    for (let t = 16; t < 64; t++) {
      const s0 = (rightRotate(W[t - 15], 7) ^ rightRotate(W[t - 15], 18) ^ (W[t - 15] >>> 3));
      const s1 = (rightRotate(W[t - 2], 17) ^ rightRotate(W[t - 2], 19) ^ (W[t - 2] >>> 10));
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25));
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
      const S0 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }

    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }

  return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

function rightRotate(n: number, d: number): number {
  return (n >>> d) | (n << (32 - d));
}

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0c33, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function computeBillHash(bill: BillRow, prevHash: string): string {
  const data = `${bill.id}|${bill.date}|${bill.amount}|${bill.merchant}|${bill.type}|${bill.created_at}|${prevHash}`;
  return sha256(data);
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

    const hash = computeBillHash(bill, prevHash);
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
      const expectedHash = computeBillHash(bill, prevHash);
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
      const expectedHash = computeBillHash(bill, prevHash);

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
