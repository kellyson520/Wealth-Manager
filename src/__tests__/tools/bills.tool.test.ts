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

import { add_bill, normalizeBillCategory, search_bills } from '../../tools/bills/bills.tool';
import * as db from '../../core/database/database';

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
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE bills SET hash'),
        expect.any(Array)
      );
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

    test('defaults category to "其他"', async () => {
      const mockBill = { id: 'test-id', amount: 100, type: 'expense' as const };
      const mockDb = await getMockDb();
      mockDb.getFirstAsync.mockResolvedValue(mockBill);

      await add_bill({ amount: 100, type: 'expense', merchant: '测试' });
      const callArgs = mockDb.runAsync.mock.calls[0][1];
      expect(callArgs[3]).toBe('其他');
    });

    test('normalizes natural expense categories from cloud tool args', async () => {
      const mockDb = await getMockDb();
      mockDb.getFirstAsync.mockResolvedValue({ id: 'test', amount: 32, category: '餐饮' });

      await add_bill({ amount: 32, type: 'expense', merchant: '午饭', category: '午饭' });
      const callArgs = mockDb.runAsync.mock.calls[0][1];
      expect(callArgs[3]).toBe('餐饮');
    });

    test('normalizes natural income categories from cloud tool args', async () => {
      const mockDb = await getMockDb();
      mockDb.getFirstAsync.mockResolvedValue({ id: 'test', amount: 5000, category: '工资' });

      await add_bill({ amount: 5000, type: 'income', merchant: '薪水', category: '薪水' });
      const callArgs = mockDb.runAsync.mock.calls[0][1];
      expect(callArgs[3]).toBe('工资');
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

    test('normalizes category filter aliases', async () => {
      await search_bills({ category: '午饭' });
      const mockDb = await getMockDb();
      const values = mockDb.getAllAsync.mock.calls[0][1];
      expect(values).toContain('餐饮');
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

describe('normalizeBillCategory', () => {
  test('maps common merchant-like phrases to canonical categories', () => {
    expect(normalizeBillCategory('打车', 'expense')).toBe('交通');
    expect(normalizeBillCategory('盲盒', 'expense')).toBe('娱乐');
    expect(normalizeBillCategory('薪水', 'income')).toBe('工资');
    expect(normalizeBillCategory('未知小项', 'expense')).toBe('其他');
  });
});
