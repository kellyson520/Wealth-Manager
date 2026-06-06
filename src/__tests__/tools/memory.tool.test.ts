jest.mock('../../core/persona/persona-engine', () => ({
  setPersonaParams: jest.fn().mockResolvedValue({ rigor: 8, humor: 2, proactivity: 6 }),
}));

jest.mock('../../core/memory/adaptive-context', () => ({
  deleteAiMemory: jest.fn().mockResolvedValue(true),
  getPersonaSnapshot: jest.fn().mockResolvedValue({ id: 'persona_1' }),
  listAiMemories: jest.fn().mockResolvedValue([
    { id: 'mem_1', kind: 'user_profile', content: '沟通偏好: 简洁', updatedAt: '2026-06-01' },
  ]),
  refreshAgentMemoryDigest: jest.fn().mockResolvedValue('- pattern: 少买奶茶 -> set_budget'),
  setNluLearningEnabled: jest.fn().mockResolvedValue(false),
  updatePersonaSnapshot: jest.fn().mockResolvedValue({ id: 'persona_2', soul: '稳定人格' }),
  upsertUserProfileMemory: jest.fn().mockResolvedValue({
    id: 'pref_1',
    key: '沟通偏好',
    value: '简洁',
    confidence: 0.9,
    hits: 1,
    source: 'user',
  }),
}));

jest.mock('../../core/cloud/prompt-cache', () => ({
  getPromptCacheDashboard: jest.fn().mockResolvedValue({
    overall: { averageHitRate: 96.5, calls: 3, warmCalls: 2 },
    stats: [{ scope: 'master:mimo-v2.5-pro', agentId: 'master', averageHitRate: 96.5 }],
    recent: [],
  }),
}));

import {
  deleteAiMemory,
  listAiMemories,
  setNluLearningEnabled,
  updatePersonaSnapshot,
  upsertUserProfileMemory,
} from '../../core/memory/adaptive-context';
import { getPromptCacheDashboard } from '../../core/cloud/prompt-cache';
import {
  delete_ai_memory,
  get_ai_cache_stats,
  list_ai_memories,
  remember_user_preference,
  set_ai_learning_enabled,
  update_ai_persona,
} from '../../tools/memory/memory.tool';

describe('memory tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('lists AI memories', async () => {
    const result = await list_ai_memories({ kind: 'user_profile', limit: 5 });

    expect(result.success).toBe(true);
    expect(listAiMemories).toHaveBeenCalledWith({ kind: 'user_profile', limit: 5 });
  });

  test('deletes an AI memory by id and kind', async () => {
    const result = await delete_ai_memory({ id: 'mem_1', kind: 'user_profile' });

    expect(result.success).toBe(true);
    expect(deleteAiMemory).toHaveBeenCalledWith('mem_1', 'user_profile');
  });

  test('rejects delete without required fields', async () => {
    const result = await delete_ai_memory({ id: '', kind: 'user_profile' });

    expect(result.success).toBe(false);
    expect(deleteAiMemory).not.toHaveBeenCalled();
  });

  test('rejects delete with unknown memory kind', async () => {
    const result = await delete_ai_memory({ id: 'mem_1', kind: 'unknown' as any });

    expect(result.success).toBe(false);
    expect(deleteAiMemory).not.toHaveBeenCalled();
  });

  test('remembers explicit user preference', async () => {
    const result = await remember_user_preference({
      key: '沟通偏好',
      value: '简洁',
      confidence: 0.9,
    });

    expect(result.success).toBe(true);
    expect(upsertUserProfileMemory).toHaveBeenCalledWith({
      key: '沟通偏好',
      value: '简洁',
      confidence: 0.9,
      source: 'user',
    });
  });

  test('rejects malformed user preference payload', async () => {
    const result = await remember_user_preference({
      key: '沟通偏好',
      value: 123 as any,
    });

    expect(result.success).toBe(false);
    expect(upsertUserProfileMemory).not.toHaveBeenCalled();
  });

  test('updates AI persona snapshot', async () => {
    const result = await update_ai_persona({
      rigor: 8,
      soul: '稳定人格',
      toneRules: ['简洁'],
    });

    expect(result.success).toBe(true);
    expect(updatePersonaSnapshot).toHaveBeenCalledWith({
      soul: '稳定人格',
      toneRules: ['简洁'],
      boundaries: undefined,
      source: 'user',
    });
  });

  test('normalizes string persona rules before saving snapshot', async () => {
    const result = await update_ai_persona({
      soul: '稳定人格',
      toneRules: '简洁\n克制' as any,
      boundaries: '不编造' as any,
    });

    expect(result.success).toBe(true);
    expect(updatePersonaSnapshot).toHaveBeenCalledWith({
      soul: '稳定人格',
      toneRules: ['简洁', '克制'],
      boundaries: ['不编造'],
      source: 'user',
    });
  });

  test('rejects invalid persona score values', async () => {
    const result = await update_ai_persona({ rigor: Number.NaN });

    expect(result.success).toBe(false);
    expect(updatePersonaSnapshot).not.toHaveBeenCalled();
  });

  test('toggles NLU learning', async () => {
    const result = await set_ai_learning_enabled({ enabled: false });

    expect(result.success).toBe(true);
    expect(setNluLearningEnabled).toHaveBeenCalledWith(false);
  });

  test('rejects non-boolean NLU learning value', async () => {
    const result = await set_ai_learning_enabled({ enabled: 'false' as any });

    expect(result.success).toBe(false);
    expect(setNluLearningEnabled).not.toHaveBeenCalled();
  });

  test('returns AI prompt cache stats', async () => {
    const result = await get_ai_cache_stats({ agentId: 'master', limit: 10 });

    expect(result.success).toBe(true);
    expect(getPromptCacheDashboard).toHaveBeenCalledWith({
      agentId: 'master',
      scope: undefined,
      limit: 10,
    });
  });
});
