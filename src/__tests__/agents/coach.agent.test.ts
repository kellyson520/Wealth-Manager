jest.mock('../../tools/budget/budget.tool', () => ({
  set_budget: jest.fn(),
  create_savings_goal: jest.fn(),
  get_savings_progress: jest.fn(),
}));

jest.mock('../../tools/gamification/gamification.tool', () => ({
  get_streak_info: jest.fn(),
  get_achievement: jest.fn(),
}));

jest.mock('../../tools/stats/stats.tool', () => ({
  get_budget_status: jest.fn(),
}));

jest.mock('../../tools/proactive/proactive.tool', () => ({
  run_proactive_check: jest.fn(),
  get_proactive_insights: jest.fn(),
  get_today_summary: jest.fn(),
}));

const mockCreateLinkHandler = jest.fn();

jest.mock('../../agents/_shared', () => ({
  canCallTool: jest.fn().mockReturnValue({ allowed: true, reason: '' }),
  rememberThis: jest.fn().mockResolvedValue(undefined),
  rememberMoment: jest.fn().mockResolvedValue(undefined),
  getTool: jest.fn((name: string) => {
    if (name === 'create_link') {
      return { handler: mockCreateLinkHandler };
    }
    return undefined;
  }),
}));

import { handleIntent } from '../../agents/coach/coach.agent';

describe('Coach Agent - handleIntent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not expose share token in share_bills reply', async () => {
    mockCreateLinkHandler.mockResolvedValue({
      success: true,
      data: {
        token: 'secret-share-token',
        summary: { billCount: 2, totalExpense: 238 },
      },
    });

    const reply = await handleIntent({
      intent: 'share_bills',
      params: {},
      confidence: 0.9,
      agent: 'coach',
    });

    expect(reply).toContain('已生成分享链接');
    expect(reply).toContain('包含 2 条账单');
    expect(reply).not.toContain('secret-share-token');
    expect(reply).not.toContain('Token:');
  });
});
