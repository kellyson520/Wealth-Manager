jest.mock('../../core/database/database', () => {
  const mockDb = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
  };

  return {
    getDatabase: jest.fn().mockResolvedValue(mockDb),
  };
});

import { generateHashForBill, rebuildHashChain, verifyHashChain } from '../../core/hashchain/hashchain';
import * as database from '../../core/database/database';

function getMockDb() {
  return database.getDatabase() as unknown as Promise<{
    execAsync: jest.Mock;
    runAsync: jest.Mock;
    getFirstAsync: jest.Mock;
    getAllAsync: jest.Mock;
  }>;
}

describe('hashchain security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WEALTH_MANAGER_HASHCHAIN_KEY = 'unit-test-hash-key';
  });

  test('generateHashForBill writes an HMAC-based hash', async () => {
    const mockDb = await getMockDb();
    mockDb.getFirstAsync
      .mockResolvedValueOnce({
        id: 'bill-1',
        amount: 99,
        category: '餐饮',
        tags: '["lunch"]',
        merchant: 'Cafe',
        raw_description: 'Cafe lunch',
        date: '2026-06-08',
        note: 'team lunch',
        type: 'expense',
        source: 'manual',
        created_at: '2026-06-08T10:00:00.000Z',
      })
      .mockResolvedValueOnce({ hash: 'previous-hash' });

    const result = await generateHashForBill('bill-1', 'bill-0');

    expect(result).toBe(true);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE bills SET hash = ?, prev_hash = ? WHERE id = ?',
      [expect.stringMatching(/^[a-f0-9]{64}$/), 'previous-hash', 'bill-1']
    );
  });

  test('verifyHashChain detects tampering in covered fields', async () => {
    const baseBill = {
      id: 'bill-1',
      amount: 99,
      category: '餐饮',
      tags: '["lunch"]',
      merchant: 'Cafe',
      raw_description: 'Cafe lunch',
      date: '2026-06-08',
      note: 'team lunch',
      type: 'expense',
      source: 'manual',
      created_at: '2026-06-08T10:00:00.000Z',
    };

    const mockDb = await getMockDb();
    mockDb.getFirstAsync
      .mockResolvedValueOnce(baseBill)
      .mockResolvedValueOnce(null);

    await generateHashForBill('bill-1');
    const writtenHash = mockDb.runAsync.mock.calls[0][1][0];

    mockDb.getAllAsync.mockResolvedValue([
      {
        ...baseBill,
        note: 'tampered note',
        hash: writtenHash,
        prev_hash: '',
      },
    ]);

    const result = await verifyHashChain();

    expect(result.valid).toBe(false);
    expect(result.firstBrokenBillId).toBe('bill-1');
  });

  test('rebuildHashChain repairs broken hashes with HMAC values', async () => {
    const mockDb = await getMockDb();
    mockDb.getAllAsync.mockResolvedValue([
      {
        id: 'bill-1',
        amount: 10,
        category: '餐饮',
        tags: '[]',
        merchant: 'Shop',
        raw_description: 'Shop',
        date: '2026-06-08',
        note: '',
        type: 'expense',
        source: 'manual',
        created_at: '2026-06-08T10:00:00.000Z',
        hash: 'broken',
        prev_hash: '',
      },
    ]);

    const result = await rebuildHashChain();

    expect(result.success).toBe(true);
    expect(result.fixed).toBe(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE bills SET hash = ?, prev_hash = ? WHERE id = ?',
      [expect.stringMatching(/^[a-f0-9]{64}$/), '', 'bill-1']
    );
  });
});
