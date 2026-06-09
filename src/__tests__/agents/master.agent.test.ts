jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn().mockResolvedValue({
    execAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
    runAsync: jest.fn(),
    closeAsync: jest.fn(),
  }),
}));

jest.mock('../../core/database/database', () => ({
  getDatabase: jest.fn().mockResolvedValue({
    execAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
    runAsync: jest.fn(),
    closeAsync: jest.fn(),
  }),
  closeDatabase: jest.fn(),
}));

jest.mock('../../agents/master/nlu', () => ({
  classifyIntent: jest.fn().mockReturnValue({ intent: 'greeting', params: {}, confidence: 0.95, agent: 'coach' }),
}));
jest.mock('../../agents/ledger/ledger.agent', () => ({
  handleIntent: jest.fn(),
}));
jest.mock('../../agents/_shared', () => ({
  getSecurityProfile: jest.fn().mockReturnValue({ maxPermissionLevel: 1 }),
  getCriticalRules: jest.fn().mockReturnValue([]),
  generateSecurityPrompt: jest.fn().mockReturnValue(''),
  getDelegationTargets: jest.fn().mockReturnValue(['ledger', 'analyst']),
  rememberMoment: jest.fn().mockResolvedValue(undefined),
  recallRecentContext: jest.fn().mockResolvedValue([]),
  initToolRegistry: jest.fn(),
  getTool: jest.fn().mockReturnValue(undefined),
  listToolsForAgent: jest.fn().mockReturnValue([]),
  executeTool: jest.fn(),
  canCallTool: jest.fn().mockReturnValue({ allowed: true }),
}));
jest.mock('../../agents/_shared/memory', () => ({
  recallRecentContext: jest.fn().mockResolvedValue(''),
}));
jest.mock('../../agents/guardian/guardian.agent', () => ({
  sanitizeText: jest.fn((t: string) => t),
}));
jest.mock('../../agents/analyst/analyst.agent', () => ({
  handleIntent: jest.fn(),
}));
jest.mock('../../agents/coach/coach.agent', () => ({
  handleIntent: jest.fn().mockResolvedValue('您好！我是 Wealth Manager'),
}));
jest.mock('../../tools/stats/stats.tool', () => ({
  get_aggregation: jest.fn(),
}));
jest.mock('../../tools/bills/bills.tool', () => ({
  add_bill: jest.fn(),
  search_bills: jest.fn(),
}));
jest.mock('../../core/cloud/api', () => ({
  callCloudLLM: jest.fn(),
  callCloudLLMStream: jest.fn(),
}));
jest.mock('../../core/cloud/prompts/agent-prompts', () => ({
  getAgentSystemPrompt: jest.fn().mockResolvedValue(''),
}));
jest.mock('../../core/memory/adaptive-context', () => ({
  buildAdaptiveContextPrompt: jest.fn().mockResolvedValue(''),
}));
jest.mock('../../core/persona/persona-engine', () => ({
  generatePersonaPrompt: jest.fn().mockReturnValue(''),
  updateMood: jest.fn().mockResolvedValue(undefined),
  loadPersona: jest.fn().mockResolvedValue(undefined),
}));

import { processMessage, processMessageStream, setCloudApiKey } from '../../agents/master/master.agent';
import { classifyIntent } from '../../agents/master/nlu';
import { callCloudLLM, callCloudLLMStream } from '../../core/cloud/api';
import { getTool, executeTool } from '../../agents/_shared';
import { IntentResult } from '../../shared/types';

describe('Master Agent - processMessage', () => {
  test('returns a properly structured reply on any message', async () => {
    const result = await processMessage('你好');

    expect(result.reply).toBeDefined();
    expect(result.reply.role).toBe('assistant');
    expect(result.reply.content.length).toBeGreaterThan(0);
    expect(result.reply.id).toBeDefined();
    expect(result.reply.timestamp).toBeDefined();
  });

  test('generates unique message IDs for different calls', async () => {
    const result1 = await processMessage('你好');
    const result2 = await processMessage('你好');

    expect(result1.reply.id).not.toBe(result2.reply.id);
  });

  test('returns timestamp in ISO format', async () => {
    const result = await processMessage('你好');
    expect(() => new Date(result.reply.timestamp)).not.toThrow();
  });

  test('handles empty input gracefully', async () => {
    const result = await processMessage('');
    expect(result.reply).toBeDefined();
    expect(result.reply.content.length).toBeGreaterThan(0);
  });

  test('handles expense message routing', async () => {
    const result = await processMessage('午饭花了35块');
    expect(result.reply).toBeDefined();
    expect(result.reply.role).toBe('assistant');
  });

  test('does not send local NLU params to cloud fallback', async () => {
    setCloudApiKey('test-key');
    (classifyIntent as jest.Mock).mockReturnValueOnce({
      intent: 'modify_bill',
      params: { billId: '12345678-abcd-1234-abcd-123456789abc', category: '餐饮' },
      confidence: 0.42,
      agent: 'ledger',
    });
    (callCloudLLM as jest.Mock).mockResolvedValueOnce({
      success: true,
      response: { content: '好的' },
    });

    await processMessage('请帮我确认这笔账单分类');
    setCloudApiKey(undefined);

    const cloudRequest = (callCloudLLM as jest.Mock).mock.calls[0][0];
    const promptText = cloudRequest.messages.map((message: { content: string }) => message.content).join('\n');
    expect(promptText).toContain('本地NLU分析结果');
    expect(promptText).not.toContain('参数=');
    expect(promptText).not.toContain('12345678-abcd-1234-abcd-123456789abc');
  });

  test('reports unknown streamed tool calls as unavailable', async () => {
    setCloudApiKey('test-key');
    (callCloudLLMStream as jest.Mock).mockImplementationOnce(async function* () {
      yield {
        type: 'function_call',
        functionCall: { name: 'unknown_tool', arguments: '{}' },
      };
      yield { type: 'done' };
    });

    const events = [];
    for await (const event of processMessageStream('调用未知工具')) {
      events.push(event);
    }
    setCloudApiKey(undefined);

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'tool_result',
        content: '工具 unknown_tool 不存在或不可用',
      })
    );
  });

  test('does not expose raw tool exception details', async () => {
    setCloudApiKey('test-key');
    (getTool as jest.Mock).mockReturnValueOnce({
      definition: { name: 'create_link', permissionLevel: 1 },
      handler: jest.fn(),
    });
    (executeTool as jest.Mock).mockRejectedValueOnce(new Error('token=secret path=/tmp/private.db'));
    (classifyIntent as jest.Mock).mockReturnValueOnce({ intent: 'unknown', params: {}, confidence: 0.1, agent: 'master' });
    (callCloudLLM as jest.Mock).mockResolvedValueOnce({
      success: true,
      response: { functionCall: { name: 'create_link', arguments: '{}' } },
    });

    const result = await processMessage('创建分享链接');
    setCloudApiKey(undefined);

    expect(result.reply.content).toBe('工具 create_link 执行异常，请稍后重试');
    expect(result.reply.content).not.toContain('secret');
    expect(result.reply.content).not.toContain('/tmp/private.db');
  });
});
