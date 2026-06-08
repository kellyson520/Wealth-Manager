jest.mock('expo-sqlite', () => {
  const mockDb = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn().mockResolvedValue([]),
    closeAsync: jest.fn().mockResolvedValue(undefined),
  };

  return {
    openDatabaseAsync: jest.fn().mockResolvedValue(mockDb),
  };
});

jest.mock('../../core/database/database', () => {
  const mockDb = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
    closeAsync: jest.fn().mockResolvedValue(undefined),
  };

  return {
    getDatabase: jest.fn().mockResolvedValue(mockDb),
    closeDatabase: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('../../core/hashchain/hashchain', () => ({
  generateHashForBill: jest.fn().mockResolvedValue('hash'),
  rebuildHashChain: jest.fn().mockResolvedValue({ valid: true }),
}));

import { add_bill, modify_bill, refund_bill, search_bills, split_bill } from '../../tools/bills/bills.tool';
import * as db from '../../core/database/database';
import { generateHashForBill, rebuildHashChain } from '../../core/hashchain/hashchain';

function getMockDb() {
  return db.getDatabase() as any;
}

describe('add_bill Tool', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
  });

  describe('happy path', () => {
    test('creates an expense bill successfully', async () => {
      const mockBill = {
        id: 'test-id-1',
        amount: 35,
        type: 'expense',
        category: '餐饮',
        tags: '[]',
        merchant: '午饭',
        raw_description: '午饭',
        date: '2024-01-15',
        note: '',
        source: 'manual',
        created_at: '2024-01-15T12:00:00.000Z',
      };

      const mockDb = await getMockDb();
      mockDb.getFirstAsync.mockResolvedValue(mockBill);

      const result = await add_bill({
        amount: 35,
        type: 'expense',
        merchant: '午饭',
        category: '餐饮',
        date: '2024-01-15',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockBill);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bills'),
        expect.any(Array)
      );
      expect(generateHashForBill).toHaveBeenCalledWith(expect.any(String));
    });

    test('creates an income bill successfully', async () => {
      const mockBill = {
        id: 'test-id-2',
        amount: 5000,
        type: 'income',
        category: '工资',
        tags: '[]',
        merchant: '工资',
        raw_description: '工资',
        date: '2024-01-15',
        note: '',
        source: 'manual',
        created_at: '2024-01-15T12:00:00.000Z',
      };

      const mockDb = await getMockDb();
      mockDb.getFirstAsync.mockResolvedValue(mockBill);

      const result = await add_bill({
        amount: 5000,
        type: 'income',
        merchant: '工资',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockBill);
    });
  });

  describe('edge cases', () => {
    test('rejects zero amount', async () => {
      const result = await add_bill({ amount: 0, type: 'expense', merchant: '测试' });
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('1002');
    });

    test('rejects negative amount', async () => {
      const result = await add_bill({ amount: -50, type: 'expense', merchant: '测试' });
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('1002');
    });

    test('rejects NaN amount', async () => {
      const result = await add_bill({ amount: NaN, type: 'expense', merchant: '测试' });
      expect(result.success).toBe(false);
    });

    test('rejects infinite amount', async () => {
      const result = await add_bill({ amount: Infinity, type: 'expense', merchant: '测试' });
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('1002');
    });

    test('defaults category to "其他"', async () => {
      const mockBill = { id: 'test-id', amount: 100, type: 'expense' as const };
      const mockDb = await getMockDb();
      mockDb.getFirstAsync.mockResolvedValue(mockBill);

      await add_bill({ amount: 100, type: 'expense', merchant: '测试' });
      const callArgs = mockDb.runAsync.mock.calls[0][1];
      expect(callArgs[3]).toBe('其他');
    });

    test('handles very large amount', async () => {
      const mockDb = await getMockDb();
      mockDb.getFirstAsync.mockResolvedValue({ id: 'test', amount: 99999999 });

      const result = await add_bill({ amount: 99999999, type: 'expense', merchant: '大额' });
      expect(result.success).toBe(true);
    });

    test('uses provided date instead of today', async () => {
      const mockDb = await getMockDb();
      mockDb.getFirstAsync.mockResolvedValue({ id: 'test', date: '2023-06-15' });

      await add_bill({ amount: 50, type: 'expense', merchant: '测试', date: '2023-06-15' });
      const callArgs = mockDb.runAsync.mock.calls[0][1];
      expect(callArgs[6]).toBe('2023-06-15');
    });
  });

  describe('error handling', () => {
    test('returns error when database insert fails', async () => {
      const mockDb = await getMockDb();
      mockDb.runAsync.mockRejectedValue(new Error('DB Error'));

      const result = await add_bill({ amount: 50, type: 'expense', merchant: '测试' });
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('1000');
    });
  });
});

describe('search_bills Tool', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    const mockDb = await getMockDb();
    mockDb.getAllAsync.mockResolvedValue([]);
  });

  describe('happy path', () => {
    test('returns empty array when no bills exist', async () => {
      const result = await search_bills({});
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    test('returns bills matching criteria', async () => {
      const mockBills = [
        { id: '1', amount: 35, type: 'expense', merchant: '午饭', date: '2024-01-15' },
      ];
      const mockDb = await getMockDb();
      mockDb.getAllAsync.mockResolvedValue(mockBills);

      const result = await search_bills({ keyword: '午饭' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockBills);
    });
  });

  describe('filters', () => {
    test('applies keyword filter', async () => {
      await search_bills({ keyword: '奶茶' });
      const mockDb = await getMockDb();
      const sql = mockDb.getAllAsync.mock.calls[0][1];
      expect(sql).toContain('%奶茶%');
    });

    test('applies date range', async () => {
      await search_bills({ startDate: '2024-01-01', endDate: '2024-01-31' });
      const mockDb = await getMockDb();
      const callArgs = mockDb.getAllAsync.mock.calls[0];
      expect(callArgs[0]).toContain('date >=');
      expect(callArgs[0]).toContain('date <=');
    });

    test('applies type filter via parameterized query', async () => {
      await search_bills({ type: 'income' });
      const mockDb = await getMockDb();
      const sql = mockDb.getAllAsync.mock.calls[0][0];
      const values = mockDb.getAllAsync.mock.calls[0][1];
      expect(sql).toContain('type = ?');
      expect(values).toContain('income');
    });
  });

  describe('edge cases', () => {
    test('defaults limit to 50', async () => {
      await search_bills({});
      const mockDb = await getMockDb();
      const callArgs = mockDb.getAllAsync.mock.calls[0];
      const values = callArgs[1];
      expect(values[values.length - 2]).toBe(50);
    });

    test('custom limit and offset are respected', async () => {
      await search_bills({ limit: 10, offset: 5 });
      const mockDb = await getMockDb();
      const callArgs = mockDb.getAllAsync.mock.calls[0];
      const values = callArgs[1];
      expect(values[values.length - 2]).toBe(10);
      expect(values[values.length - 1]).toBe(5);
    });

    test('caps large limits to avoid unbounded bill queries', async () => {
      await search_bills({ limit: 1000, offset: 0 });
      const mockDb = await getMockDb();
      const values = mockDb.getAllAsync.mock.calls[0][1];
      expect(values[values.length - 2]).toBe(200);
      expect(values[values.length - 1]).toBe(0);
    });

    test('rejects invalid pagination before querying bills', async () => {
      const mockDb = await getMockDb();

      for (const params of [
        { limit: 0 },
        { limit: -1 },
        { limit: 1.5 },
        { offset: -1 },
        { offset: 2.5 },
      ]) {
        const result = await search_bills(params);
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('1002');
      }

      expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    test('returns error on database failure', async () => {
      const mockDb = await getMockDb();
      mockDb.getAllAsync.mockRejectedValue(new Error('DB Error'));

      const result = await search_bills({});
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('1000');
    });
  });
});

describe('modify_bill Tool', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
  });

  test('rejects negative amount updates before querying the database', async () => {
    const mockDb = await getMockDb();

    const result = await modify_bill({ billId: 'bill-1', amount: -1 });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('1002');
    expect(mockDb.getFirstAsync).not.toHaveBeenCalled();
  });

  test('rejects NaN amount updates before querying the database', async () => {
    const mockDb = await getMockDb();

    const result = await modify_bill({ billId: 'bill-1', amount: NaN });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('1002');
    expect(mockDb.getFirstAsync).not.toHaveBeenCalled();
  });
});

describe('split_bill Tool', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
  });

  test('rejects non-positive split amounts before querying the database', async () => {
    const mockDb = await getMockDb();

    const result = await split_bill({
      billId: 'bill-1',
      splits: [
        { amount: 150, category: '餐饮' },
        { amount: -50, category: '优惠' },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('拆分金额必须全部大于0');
    expect(mockDb.getFirstAsync).not.toHaveBeenCalled();
  });

  test('splits bills inside a transaction and rebuilds the hash chain', async () => {
    const mockDb = await getMockDb();
    mockDb.getFirstAsync.mockResolvedValue({
      id: 'bill-1',
      amount: 100,
      type: 'expense',
      category: '餐饮',
      merchant: '午饭',
      date: '2024-01-15',
    });
    mockDb.runAsync.mockResolvedValue({ changes: 1 });

    const result = await split_bill({
      billId: 'bill-1',
      splits: [
        { amount: 40, category: '餐饮' },
        { amount: 60, category: '交通' },
      ],
    });

    expect(result.success).toBe(true);
    expect(mockDb.execAsync).toHaveBeenNthCalledWith(1, 'BEGIN IMMEDIATE TRANSACTION');
    expect(mockDb.execAsync).toHaveBeenNthCalledWith(2, 'COMMIT');
    expect(mockDb.runAsync).toHaveBeenCalledTimes(3);
    expect(rebuildHashChain).toHaveBeenCalled();
  });

  test('rolls back when creating a split bill fails', async () => {
    const mockDb = await getMockDb();
    mockDb.getFirstAsync.mockResolvedValue({
      id: 'bill-1',
      amount: 100,
      type: 'expense',
      category: '餐饮',
      merchant: '午饭',
      date: '2024-01-15',
    });
    mockDb.runAsync
      .mockResolvedValueOnce({ changes: 1 })
      .mockRejectedValueOnce(new Error('insert failed'));

    const result = await split_bill({
      billId: 'bill-1',
      splits: [
        { amount: 40, category: '餐饮' },
        { amount: 60, category: '交通' },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('1000');
    expect(mockDb.execAsync).toHaveBeenNthCalledWith(1, 'BEGIN IMMEDIATE TRANSACTION');
    expect(mockDb.execAsync).toHaveBeenNthCalledWith(2, 'ROLLBACK');
    expect(rebuildHashChain).not.toHaveBeenCalled();
  });
});

describe('refund_bill Tool', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
  });

  test('generates a hash for the refund bill', async () => {
    const mockDb = await getMockDb();
    const originalBill = {
      id: 'bill-1',
      amount: 100,
      type: 'expense',
      category: '餐饮',
      merchant: '午饭',
    };
    const refundBill = {
      id: 'refund-1',
      amount: 40,
      type: 'refund',
      category: '餐饮',
      merchant: '午饭',
    };
    mockDb.getFirstAsync
      .mockResolvedValueOnce(originalBill)
      .mockResolvedValueOnce(refundBill);
    mockDb.runAsync.mockResolvedValue({ changes: 1 });

    const result = await refund_bill({ billId: 'bill-1', amount: 40 });

    expect(result.success).toBe(true);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO bills'),
      expect.any(Array)
    );
    expect(generateHashForBill).toHaveBeenCalledWith(expect.any(String));
  });

  test('rejects invalid refund amounts before inserting a refund bill', async () => {
    const mockDb = await getMockDb();
    mockDb.getFirstAsync.mockResolvedValue({
      id: 'bill-1',
      amount: 100,
      type: 'expense',
      category: '餐饮',
      merchant: '午饭',
    });

    const result = await refund_bill({ billId: 'bill-1', amount: 101 });

    expect(result.success).toBe(false);
    expect(result.error).toBe('退款金额不合法');
    expect(mockDb.runAsync).not.toHaveBeenCalled();
    expect(generateHashForBill).not.toHaveBeenCalled();
  });
});
