const mockDb = {
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  getFirstAsync: jest.fn(),
  getAllAsync: jest.fn().mockResolvedValue([]),
};

jest.mock('../../core/database/database', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('../../core/memory/adaptive-context', () => ({
  isNluLearningEnabled: jest.fn(),
}));

import { getDatabase } from '../../core/database/database';
import { isNluLearningEnabled } from '../../core/memory/adaptive-context';
import { classifyIntent } from '../../agents/master/nlu';
import { learnIntentAlias, resetNluLearningForTest } from '../../agents/master/nlu-learning';

describe('NLU learning database sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetNluLearningForTest();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    (isNluLearningEnabled as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => {
    resetNluLearningForTest();
  });

  test('syncs auto-promoted cloud aliases into memory immediately', async () => {
    mockDb.getFirstAsync.mockResolvedValue({
      id: 'nlu_1',
      phrase: '奶茶封印',
      normalized_text: '奶茶封印',
      intent: 'set_budget',
      agent: 'coach',
      params: JSON.stringify({ category: '饮品', limit: 100 }),
      source: 'cloud_function',
      confidence: 0.86,
      hits: 3,
      enabled: 1,
      created_at: '2026-06-06T00:00:00.000Z',
      updated_at: '2026-06-06T00:01:00.000Z',
    });

    await learnIntentAlias({
      text: '奶茶封印',
      intent: 'set_budget',
      agent: 'coach',
      params: { category: '饮品', limit: 100 },
      source: 'cloud_function',
      confidence: 0.84,
    });

    const result = classifyIntent('奶茶封印');

    expect(result.intent).toBe('set_budget');
    expect(result.agent).toBe('coach');
    expect(result.params).toEqual({ category: '饮品', limit: 100 });
  });
});
