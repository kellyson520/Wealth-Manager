jest.mock('../ledger/ledger.agent', () => ({
  handleIntent: jest.fn(),
}));
jest.mock('../_shared', () => ({
  getSecurityProfile: jest.fn().mockReturnValue({ maxPermissionLevel: 1 }),
  getCriticalRules: jest.fn().mockReturnValue([]),
  generateSecurityPrompt: jest.fn().mockReturnValue(''),
}));
jest.mock('../guardian/guardian.agent', () => ({
  sanitizeText: jest.fn((t: string) => t),
}));

import { processMessage } from '../../agents/master/master.agent';
import { IntentResult } from '../../shared/types';

describe('Master Agent - processMessage', () => {
  test('processes a greeting message and returns reply', async () => {
    const handleIntentFn = jest.fn().mockResolvedValue('你好！我是 Wealth Manager');

    const result = await processMessage('你好', handleIntentFn);

    expect(result.reply).toBeDefined();
    expect(result.reply.role).toBe('assistant');
    expect(result.reply.content).toBe('你好！我是 Wealth Manager');
    expect(result.reply.id).toBeDefined();
    expect(result.reply.timestamp).toBeDefined();
  });

  test('processes an expense message and returns reply', async () => {
    const handleIntentFn = jest.fn().mockResolvedValue('已记录 💸 午饭 ¥35.00');

    const result = await processMessage('午饭花了35块', handleIntentFn);

    expect(handleIntentFn).toHaveBeenCalled();
    const calledIntent: IntentResult = handleIntentFn.mock.calls[0][0];
    expect(calledIntent.intent).toBe('add_expense');
    expect(calledIntent.params.amount).toBe(35);
    expect(result.reply.content).toBe('已记录 💸 午饭 ¥35.00');
  });

  test('provides fallback for unknown intent with low confidence', async () => {
    const handleIntentFn = jest.fn().mockResolvedValue('');

    const result = await processMessage('abcxyz123', handleIntentFn);

    expect(result.reply.content.length).toBeGreaterThan(0);
    expect(result.reply.role).toBe('assistant');
  });

  test('generates unique message IDs', async () => {
    const handleIntentFn = jest.fn().mockResolvedValue('ok');

    const result1 = await processMessage('你好', handleIntentFn);
    const result2 = await processMessage('你好', handleIntentFn);

    expect(result1.reply.id).not.toBe(result2.reply.id);
  });

  test('returns timestamp in ISO format', async () => {
    const handleIntentFn = jest.fn().mockResolvedValue('ok');

    const result = await processMessage('你好', handleIntentFn);

    expect(() => new Date(result.reply.timestamp)).not.toThrow();
  });
});
