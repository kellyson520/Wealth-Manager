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

jest.mock('../../tools/stats/stats.tool', () => ({
  get_budget_status: jest.fn(),
}));

jest.mock('../../tools/gamification/gamification.tool', () => ({
  get_achievement: jest.fn(),
  get_streak_info: jest.fn(),
}));

jest.mock('../../tools/budget/budget.tool', () => ({
  get_savings_progress: jest.fn(),
}));

jest.mock('../../tools/automation/automation.tool', () => ({
  schedule_local_notification: jest.fn(),
}));

import { run_proactive_check, get_proactive_insights, get_today_summary } from '../../tools/proactive/proactive.tool';
import * as statsTool from '../../tools/stats/stats.tool';
import * as gamificationTool from '../../tools/gamification/gamification.tool';
import * as budgetTool from '../../tools/budget/budget.tool';
import * as db from '../../core/database/database';

function getMockDb() {
  return db.getDatabase() as any;
}

describe('run_proactive_check', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
  });

  test('returns comprehensive findings', async () => {
    (statsTool.get_budget_status as jest.Mock).mockResolvedValue({
      success: true,
      data: [
        { category: '餐饮', limit: 1000, spent: 850, remaining: 150, percentUsed: 85 },
      ],
    });

    (gamificationTool.get_achievement as jest.Mock).mockResolvedValue({
      success: true,
      data: [
        { id: 'ach_7day_streak', name: '七天坚持', description: '连续记账7天', unlocked: false, progress: 6, maxProgress: 7 },
      ],
    });

    (budgetTool.get_savings_progress as jest.Mock).mockResolvedValue({
      success: true,
      data: [
        { id: 'goal1', name: '旅行基金', targetAmount: 50000, currentAmount: 25000, deadline: '2025-12-31', createdAt: '2025-01-01' },
      ],
    });

    const mockDb = await getMockDb();
    mockDb.getFirstAsync.mockResolvedValue({ total: 5000 });
    mockDb.getAllAsync.mockResolvedValue([]);

    const result = await run_proactive_check();
    expect(result.success).toBe(true);

    const data = result.data as any;
    expect(data.timestamp).toBeDefined();
    expect(data.budgetAlerts).toBeDefined();
    expect(data.insights).toBeDefined();
    expect(Array.isArray(data.insights)).toBe(true);
  });

  test('returns empty findings when no data', async () => {
    (statsTool.get_budget_status as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    (gamificationTool.get_achievement as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    (budgetTool.get_savings_progress as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    const mockDb = await getMockDb();
    mockDb.getFirstAsync.mockResolvedValue({ total: 0 });
    mockDb.getAllAsync.mockResolvedValue([]);

    const result = await run_proactive_check();
    expect(result.success).toBe(true);
    const data = result.data as any;
    expect(data.budgetAlerts).toEqual([]);
    expect(data.upcomingAchievements).toEqual([]);
  });
});

describe('get_proactive_insights', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
  });

  test('returns insights array', async () => {
    const mockDb = await getMockDb();
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ total: 5000 })
      .mockResolvedValueOnce({ total: 8000 });

    const result = await get_proactive_insights();
    expect(result.success).toBe(true);
    const data = result.data as any;
    expect(data.insights).toBeDefined();
    expect(Array.isArray(data.insights)).toBe(true);
    expect(data.insights.length).toBeGreaterThan(0);
  });
});

describe('get_today_summary', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
  });

  test('returns summary with today and month data', async () => {
    (statsTool.get_budget_status as jest.Mock).mockResolvedValue({
      success: true,
      data: [
        { category: '餐饮', limit: 1000, spent: 500, remaining: 500, percentUsed: 50 },
      ],
    });

    const mockDb = await getMockDb();
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ total: 0 })
      .mockResolvedValueOnce({ total: 100 })
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ total: 5000 })
      .mockResolvedValueOnce({ total: 2000 })
      .mockResolvedValueOnce({ count: 30 });

    const result = await get_today_summary();
    expect(result.success).toBe(true);
    const data = result.data as any;
    expect(data.today).toBeDefined();
    expect(data.month).toBeDefined();
    expect(data.today.expense).toBe(100);
    expect(data.month.count).toBe(30);
  });
});
