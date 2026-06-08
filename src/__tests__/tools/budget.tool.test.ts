jest.mock('../../core/database/database', () => {
  const mockDb = {
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
    runAsync: jest.fn(),
  };

  return {
    getDatabase: jest.fn().mockResolvedValue(mockDb),
  };
});

jest.mock('../../core/logger/logger', () => ({
  captureError: jest.fn(),
}));

import { check_budget_overrun, update_savings_progress } from '../../tools/budget/budget.tool';
import * as db from '../../core/database/database';

function getMockDb() {
  return db.getDatabase() as any;
}

describe('check_budget_overrun', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
  });

  test('returns empty when no budgets set', async () => {
    const mockDb = await getMockDb();
    mockDb.getFirstAsync.mockResolvedValueOnce({ budget_limits: '[]' });

    const result = await check_budget_overrun({});
    expect(result.success).toBe(true);
    const data = result.data as any;
    expect(data.alerts).toEqual([]);
    expect(data.hasOverrun).toBe(false);
  });

  test('returns alert when budget exceeds 80%', async () => {
    const mockDb = await getMockDb();
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ budget_limits: '[{"category":"餐饮","limit":1000,"period":"monthly"}]' })
      .mockResolvedValueOnce({ total: 850 });

    const result = await check_budget_overrun({});
    expect(result.success).toBe(true);
    const data = result.data as any;
    expect(data.alerts.length).toBe(1);
    expect(data.alerts[0].severity).toBe('warning');
    expect(data.alerts[0].percentUsed).toBe(85);
    expect(data.hasOverrun).toBe(false);
  });

  test('returns overrun alert when budget >= 100%', async () => {
    const mockDb = await getMockDb();
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ budget_limits: '[{"category":"餐饮","limit":1000,"period":"monthly"}]' })
      .mockResolvedValueOnce({ total: 1100 });

    const result = await check_budget_overrun({});
    expect(result.success).toBe(true);
    const data = result.data as any;
    expect(data.alerts[0].severity).toBe('overrun');
    expect(data.hasOverrun).toBe(true);
  });

  test('filters by category when specified', async () => {
    const mockDb = await getMockDb();
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ budget_limits: '[{"category":"餐饮","limit":1000,"period":"monthly"},{"category":"交通","limit":500,"period":"monthly"}]' })
      .mockResolvedValueOnce({ total: 100 });

    const result = await check_budget_overrun({ category: '交通' });
    expect(result.success).toBe(true);
    const data = result.data as any;
    expect(data.alerts.length).toBe(0);
  });

  test('handles database errors gracefully', async () => {
    const mockDb = await getMockDb();
    mockDb.getFirstAsync.mockRejectedValue(new Error('DB Error'));

    const result = await check_budget_overrun({});
    expect(result.success).toBe(false);
    expect(result.error).toBe('预算检查失败');
  });
});

describe('update_savings_progress', () => {
  test('updates savings goals based on income/expense ratio', async () => {
    const mockDb = await getMockDb();
    mockDb.getFirstAsync.mockReset();
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ total: 10000 })
      .mockResolvedValueOnce({ total: 5000 });
    mockDb.getAllAsync.mockReset();
    mockDb.getAllAsync.mockResolvedValue([
      { id: 'goal1', name: '旅行基金', target_amount: 50000, current_amount: 0, deadline: null, created_at: '2024-01-01' },
    ]);
    mockDb.runAsync.mockReset();

    const result = await update_savings_progress({});
    expect(result.success).toBe(true);
    const data = result.data as any;
    expect(data.length).toBe(1);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE savings_goals SET current_amount = ? WHERE id = ?',
      [1000, 'goal1']
    );
  });

  test('handles zero income gracefully', async () => {
    const mockDb = await getMockDb();
    mockDb.getFirstAsync.mockReset();
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ total: 0 })
      .mockResolvedValueOnce({ total: 0 });
    mockDb.getAllAsync.mockReset();
    mockDb.getAllAsync.mockResolvedValue([]);

    const result = await update_savings_progress({});
    expect(result.success).toBe(true);
    const data = result.data as any;
    expect(data).toEqual([]);
  });

  test('handles database errors gracefully', async () => {
    const mockDb = await getMockDb();
    mockDb.getFirstAsync.mockReset();
    mockDb.getFirstAsync.mockRejectedValue(new Error('DB Error'));

    const result = await update_savings_progress({});
    expect(result.success).toBe(false);
  });
});
