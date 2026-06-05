jest.mock('../../core/database/database', () => {
  const mockDb = {
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
  };

  return {
    getDatabase: jest.fn().mockResolvedValue(mockDb),
  };
});

import { get_aggregation } from '../../tools/stats/stats.tool';
import * as db from '../../core/database/database';

function getMockDb() {
  return db.getDatabase() as any;
}

describe('get_aggregation Tool', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
  });

  describe('happy path', () => {
    test('returns zeroed aggregation for empty database', async () => {
      const mockDb = await getMockDb();
      mockDb.getFirstAsync
        .mockResolvedValueOnce({ total: 0 })
        .mockResolvedValueOnce({ total: 0 })
        .mockResolvedValueOnce({ count: 0 });
      mockDb.getAllAsync.mockResolvedValue([]);

      const result = await get_aggregation({ period: 'today' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        totalIncome: 0,
        totalExpense: 0,
        billCount: 0,
        byCategory: {},
      });
    });

    test('returns correct totals for today', async () => {
      const mockDb = await getMockDb();
      mockDb.getFirstAsync
        .mockResolvedValueOnce({ total: 5000 })
        .mockResolvedValueOnce({ total: 150 })
        .mockResolvedValueOnce({ count: 4 });
      mockDb.getAllAsync.mockResolvedValue([
        { category: '餐饮', total: 100 },
        { category: '交通', total: 50 },
      ]);

      const result = await get_aggregation({ period: 'today' });
      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.totalIncome).toBe(5000);
      expect(data.totalExpense).toBe(150);
      expect(data.billCount).toBe(4);
    });

    test('returns category breakdown', async () => {
      const mockDb = await getMockDb();
      mockDb.getFirstAsync
        .mockResolvedValueOnce({ total: 0 })
        .mockResolvedValueOnce({ total: 300 })
        .mockResolvedValueOnce({ count: 3 });
      mockDb.getAllAsync.mockResolvedValue([
        { category: '餐饮', total: 200 },
        { category: '交通', total: 100 },
      ]);

      const result = await get_aggregation({ period: 'month' });
      const data = result.data as any;
      expect(data.byCategory).toEqual({ '餐饮': 200, '交通': 100 });
    });
  });

  describe('period handling', () => {
    test('uses today by default', async () => {
      const mockDb = await getMockDb();
      mockDb.getFirstAsync
        .mockResolvedValueOnce({ total: 0 })
        .mockResolvedValueOnce({ total: 0 })
        .mockResolvedValueOnce({ count: 0 });
      mockDb.getAllAsync.mockResolvedValue([]);

      await get_aggregation({});
      const callArgs = mockDb.getFirstAsync.mock.calls[0][1];
      expect(callArgs[0]).toBe(new Date().toISOString().split('T')[0]);
    });

    test('week period uses correct start date', async () => {
      const mockDb = await getMockDb();
      mockDb.getFirstAsync
        .mockResolvedValueOnce({ total: 0 })
        .mockResolvedValueOnce({ total: 0 })
        .mockResolvedValueOnce({ count: 0 });
      mockDb.getAllAsync.mockResolvedValue([]);

      await get_aggregation({ period: 'week' });
      const callArgs = mockDb.getFirstAsync.mock.calls[0][1];
      const startDate = new Date(callArgs[0]);
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      expect(startDate.toISOString().split('T')[0]).toBe(weekAgo.toISOString().split('T')[0]);
    });

    test('month period uses the first day of current month', async () => {
      const mockDb = await getMockDb();
      mockDb.getFirstAsync
        .mockResolvedValueOnce({ total: 0 })
        .mockResolvedValueOnce({ total: 0 })
        .mockResolvedValueOnce({ count: 0 });
      mockDb.getAllAsync.mockResolvedValue([]);

      await get_aggregation({ period: 'month' });
      const callArgs = mockDb.getFirstAsync.mock.calls[0][1];
      const startDate = new Date(callArgs[0]);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split('T')[0];
      expect(startDate.toISOString().split('T')[0]).toBe(monthStart);
    });
  });

  describe('edge cases', () => {
    test('handles null database results gracefully', async () => {
      const mockDb = await getMockDb();
      mockDb.getFirstAsync
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockDb.getAllAsync.mockResolvedValue([]);

      const result = await get_aggregation({ period: 'today' });
      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.totalIncome).toBe(0);
      expect(data.totalExpense).toBe(0);
      expect(data.billCount).toBe(0);
    });
  });

  describe('error handling', () => {
    test('returns error on database failure', async () => {
      const mockDb = await getMockDb();
      mockDb.getFirstAsync.mockRejectedValue(new Error('DB Error'));

      const result = await get_aggregation({ period: 'today' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('统计失败');
    });
  });
});
