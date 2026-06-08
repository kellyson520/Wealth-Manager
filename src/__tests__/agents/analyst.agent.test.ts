jest.mock('../../tools/stats/stats.tool', () => ({
  get_aggregation: jest.fn(),
  get_budget_status: jest.fn(),
  get_net_balance: jest.fn(),
  generate_chart_config: jest.fn(),
  get_category_trend: jest.fn(),
  get_anomaly_report: jest.fn(),
  get_merchant_summary: jest.fn(),
  get_yearly_comparison: jest.fn(),
}));

jest.mock('../../agents/_shared', () => ({
  canCallTool: jest.fn().mockReturnValue({ allowed: true }),
  rememberMoment: jest.fn().mockResolvedValue(undefined),
  getTool: jest.fn(),
  executeTool: jest.fn(),
}));

import { handleIntent } from '../../agents/analyst/analyst.agent';
import { executeTool, getTool } from '../../agents/_shared';

describe('Analyst Agent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('routes CSV export through permission-checked executor', async () => {
    const handler = jest.fn().mockResolvedValue({
      success: true,
      data: { rowCount: 1, filename: 'bills.csv' },
    });
    const tool = {
      definition: { name: 'export_csv', permissionLevel: 1 },
      handler,
      allowedAgents: ['guardian', 'analyst'],
    };
    (getTool as jest.Mock).mockReturnValue(tool);
    (executeTool as jest.Mock).mockResolvedValue({
      success: false,
      error: 'analyst 权限 L0 不足以调用 L1 工具 export_csv',
      errorCode: 'PERMISSION_EXCEEDED',
      executionTimeMs: 0,
      auditLogId: 'audit-1',
    });

    const result = await handleIntent({
      intent: 'export_data',
      agent: 'analyst',
      params: { startDate: '2026-06-01' },
      confidence: 1,
    });

    expect(executeTool).toHaveBeenCalledWith(tool, { startDate: '2026-06-01' }, { agentId: 'analyst' });
    expect(handler).not.toHaveBeenCalled();
    expect(result).toBe('导出失败: analyst 权限 L0 不足以调用 L1 工具 export_csv');
  });
});
