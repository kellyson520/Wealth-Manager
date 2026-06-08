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
import { callCloudLLMStream } from '../../core/cloud/api';
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
});
