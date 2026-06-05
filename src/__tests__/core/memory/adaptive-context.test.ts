const mockDb = {
  getFirstAsync: jest.fn(),
  getAllAsync: jest.fn(),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
};

jest.mock('../../../core/database/database', () => ({
  getDatabase: jest.fn(),
}));

import { getDatabase } from '../../../core/database/database';
import {
  buildAdaptiveContextPrompt,
  isNluLearningEnabled,
  listAiMemories,
  setNluLearningEnabled,
  updatePersonaSnapshot,
  upsertUserProfileMemory,
} from '../../../core/memory/adaptive-context';

describe('adaptive context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getDatabase as jest.Mock).mockResolvedValue(mockDb);
    mockDb.runAsync.mockResolvedValue({ changes: 1 });
    mockDb.getFirstAsync.mockImplementation((query: string) => {
      if (query.includes('persona_snapshots LIMIT 1')) return Promise.resolve({ id: 'persona_1' });
      if (query.includes('FROM persona_snapshots')) {
        return Promise.resolve({
          id: 'persona_1',
          version: 1,
          soul: '稳定财务助理人格',
          tone_rules: JSON.stringify(['简洁', '审慎']),
          boundaries: JSON.stringify(['不保存敏感原文']),
          source: 'system',
          created_at: '2026-06-01T00:00:00.000Z',
          updated_at: '2026-06-01T00:00:00.000Z',
        });
      }
      if (query.includes('nlu_learning_settings')) return Promise.resolve({ value: 'true' });
      return Promise.resolve(null);
    });
    mockDb.getAllAsync.mockImplementation((query: string) => {
      if (query.includes('user_profile_memory')) {
        return Promise.resolve([
          { id: 'u1', key: '语言', value: '中文', confidence: 0.9, source: 'user', updated_at: '2026-06-01' },
        ]);
      }
      if (query.includes('memory_engine')) {
        return Promise.resolve([
          { id: 'm1', type: 'rule', content: '预算提醒要提前一天', importance: 0.8, created_at: '2026-06-01' },
        ]);
      }
      if (query.includes('nlu_learning_samples')) {
        return Promise.resolve([
          { id: 'n1', phrase: '别让我买太多盲盒', intent: 'set_budget', confidence: 0.9, source: 'test', updated_at: '2026-06-01' },
        ]);
      }
      return Promise.resolve([]);
    });
  });

  test('builds SOUL/USER/MEMORY prompt blocks', async () => {
    const prompt = await buildAdaptiveContextPrompt('master');

    expect(prompt).toContain('## SOUL');
    expect(prompt).toContain('稳定财务助理人格');
    expect(prompt).toContain('## USER');
    expect(prompt).toContain('语言: 中文');
    expect(prompt).toContain('## MEMORY');
    expect(prompt).toContain('预算提醒要提前一天');
  });

  test('lists mixed AI memories with stable shape', async () => {
    const memories = await listAiMemories({ limit: 5 });

    expect(memories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'user_profile', content: '语言: 中文' }),
        expect.objectContaining({ kind: 'memory_engine' }),
        expect.objectContaining({ kind: 'nlu_learning' }),
      ])
    );
  });

  test('reads and writes learning setting', async () => {
    await expect(setNluLearningEnabled(false)).resolves.toBe(false);
    await expect(isNluLearningEnabled()).resolves.toBe(true);
    expect(mockDb.runAsync).toHaveBeenCalled();
  });

  test('upserts user profile memory with hit accumulation fields', async () => {
    mockDb.getFirstAsync.mockImplementation((query: string) => {
      if (query.includes('FROM user_profile_memory WHERE key')) {
        return Promise.resolve({
          id: 'u1',
          key: '沟通偏好',
          value: '回复简洁一点',
          confidence: 0.92,
          hits: 2,
          source: 'user',
          created_at: '2026-06-01',
          updated_at: '2026-06-02',
        });
      }
      return Promise.resolve(null);
    });

    const memory = await upsertUserProfileMemory({
      key: '沟通偏好',
      value: '回复简洁一点',
      confidence: 0.9,
      source: 'user',
    });

    expect(memory?.hits).toBe(2);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('hits = COALESCE'),
      expect.any(Array)
    );
  });

  test('blocks sensitive content in persona snapshots', async () => {
    await expect(updatePersonaSnapshot({
      soul: '联系我 13812345678',
      source: 'settings',
    })).rejects.toThrow('敏感信息');
  });
});
