jest.mock('../../core/database/database', () => ({
  getDatabase: jest.fn().mockResolvedValue({
    runAsync: jest.fn(),
  }),
}));

import type { ToolEntry } from '../../agents/_shared/tool-registry';
import type { AgentId, PermissionLevel } from '../../shared/types';
import { executeTool } from '../../tools/_pipeline/tool-executor';

function createTool(
  name: string,
  permissionLevel: PermissionLevel,
  allowedAgents: AgentId[]
): ToolEntry {
  return {
    definition: {
      name,
      description: `${name} tool`,
      permissionLevel,
      parameters: [],
      returns: { type: 'ToolResult', description: 'result' },
      timeout: 1000,
      retryable: false,
      idempotent: false,
    },
    handler: jest.fn().mockResolvedValue({ success: true, data: { ok: true } }),
    allowedAgents,
  };
}

describe('tool executor scoped permissions', () => {
  test('allows master to run L1 AI control tools explicitly assigned to master', async () => {
    const tool = createTool('set_ai_learning_enabled', 1, ['master']);

    const result = await executeTool(tool, { enabled: false }, { agentId: 'master' });

    expect(result.success).toBe(true);
    expect(tool.handler).toHaveBeenCalledWith({ enabled: false });
  });

  test('does not allow master to run generic L1 tools even if assigned by mistake', async () => {
    const tool = createTool('add_bill', 1, ['master']);

    const result = await executeTool(tool, { amount: 10 }, { agentId: 'master' });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PERMISSION_EXCEEDED');
    expect(tool.handler).not.toHaveBeenCalled();
  });

  test('does not allow master to run L2 tools through the AI control override', async () => {
    const tool = createTool('delete_bill', 2, ['master']);

    const result = await executeTool(tool, { billId: 'bill-1' }, {
      agentId: 'master',
      userConfirmed: true,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PERMISSION_EXCEEDED');
    expect(tool.handler).not.toHaveBeenCalled();
  });
});
