const mockRunAsync = jest.fn().mockResolvedValue(undefined);
const mockGetAllAsync = jest.fn().mockResolvedValue([]);

jest.mock('../../core/database/database', () => ({
  getDatabase: jest.fn(),
}));

import { getDatabase } from '../../core/database/database';
import {
  buildCacheOptimizedMessages,
  buildPromptCacheMetrics,
  buildPromptCacheScope,
  getAdaptiveDynamicBudget,
  getPromptCacheDashboard,
  getPromptCacheRuntimeStats,
  hashToolsetForPromptCache,
  hydratePromptCacheTelemetry,
  recordPromptCacheUsage,
  resetPromptCacheTelemetryForTest,
  splitAdaptiveContextForCache,
  sortToolsForPromptCache,
} from '../../core/cloud/prompt-cache';

describe('prompt cache planning', () => {
  beforeEach(() => {
    resetPromptCacheTelemetryForTest();
    mockRunAsync.mockClear();
    mockGetAllAsync.mockResolvedValue([]);
    (getDatabase as jest.Mock).mockResolvedValue({
      runAsync: mockRunAsync,
      getAllAsync: mockGetAllAsync,
    });
  });

  test('puts stable system context before dynamic context', () => {
    const { messages, metrics } = buildCacheOptimizedMessages({
      agentSystemPrompt: 'STATIC_AGENT_PROMPT',
      toolSystemPrompt: 'STATIC_TOOL_PROMPT',
      adaptiveContext: 'DYNAMIC_MEMORY',
      personaPrompt: 'DYNAMIC_PERSONA',
      recentContext: 'DYNAMIC_RECENT',
      nluContext: 'DYNAMIC_NLU',
      userText: '今天花了多少',
    });

    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({
      role: 'system',
      content: expect.stringContaining('STATIC_AGENT_PROMPT'),
    });
    expect(messages[0].content).toContain('STATIC_TOOL_PROMPT');
    expect(messages[0].content).not.toContain('DYNAMIC_MEMORY');
    expect(messages[1].content).toContain('DYNAMIC_MEMORY');
    expect(messages[2]).toEqual({ role: 'user', content: '今天花了多少' });
    expect(metrics.cacheableRatio).toBeGreaterThan(0);
  });

  test('moves stable adaptive persona sections into cacheable prefix', () => {
    const adaptive = [
      '## SOUL\n稳定财务助理',
      '## TONE_RULES\n- 简洁中文',
      '## BOUNDARIES\n- 不保存敏感原文',
      '## USER\n- 沟通偏好: 简洁',
      '## MEMORY\n- 工具经验很多很多很多很多很多很多很多很多很多很多很多很多',
    ].join('\n\n');

    const { messages } = buildCacheOptimizedMessages({
      agentSystemPrompt: 'STATIC_AGENT_PROMPT',
      toolSystemPrompt: 'STATIC_TOOL_PROMPT',
      adaptiveContext: adaptive,
      userText: '今天花了多少',
      dynamicBudget: { adaptiveContextChars: 30 },
    });

    expect(messages[0].content).toContain('## SOUL');
    expect(messages[0].content).toContain('## TONE_RULES');
    expect(messages[0].content).toContain('## BOUNDARIES');
    expect(messages[1].content).toContain('## USER');
    expect(messages[1].content).toContain('...');
  });

  test('splits adaptive context into cacheable and dynamic sections', () => {
    const result = splitAdaptiveContextForCache([
      '## SOUL\n稳定财务助理',
      '## USER\n- 沟通偏好: 简洁',
    ].join('\n\n'));

    expect(result.cacheable).toContain('## SOUL');
    expect(result.dynamic).toContain('## USER');
  });

  test('sorts tools by name for stable tool definitions', () => {
    const tools = [
      { definition: { name: 'search_bills' } },
      { definition: { name: 'add_bill' } },
      { definition: { name: 'set_budget' } },
    ];

    const sorted = sortToolsForPromptCache(tools as any);

    expect(sorted.map((tool) => tool.definition.name)).toEqual([
      'add_bill',
      'search_bills',
      'set_budget',
    ]);
  });

  test('computes deterministic cache metrics', () => {
    const first = buildPromptCacheMetrics('stable prompt', 'dynamic prompt');
    const second = buildPromptCacheMetrics('stable prompt', 'other dynamic');

    expect(first.stablePrefixHash).toBe(second.stablePrefixHash);
    expect(first.estimatedStableTokens).toBeGreaterThan(0);
    expect(first.cacheableRatio).toBeGreaterThan(0);
  });

  test('tightens dynamic budget when warm cache hit rate is below target', () => {
    recordPromptCacheUsage('master', { promptTokens: 1300, cachedPromptTokens: 1024 });
    recordPromptCacheUsage('master', { promptTokens: 1300, cachedPromptTokens: 1024 });

    const budget = getAdaptiveDynamicBudget('master');

    expect(budget.adaptiveContextChars).toBeLessThan(420);
    expect(budget.recentContextChars).toBeLessThan(220);
    expect(budget.adaptiveContextChars).toBeGreaterThanOrEqual(180);
  });

  test('keeps default dynamic budget when warm cache hit rate meets target', () => {
    recordPromptCacheUsage('master', { promptTokens: 1650, cachedPromptTokens: 1600 });
    recordPromptCacheUsage('master', { promptTokens: 1650, cachedPromptTokens: 1600 });

    const stats = getPromptCacheRuntimeStats('master');
    const budget = getAdaptiveDynamicBudget('master');

    expect(stats.averageHitRate).toBeGreaterThan(90);
    expect(budget.adaptiveContextChars).toBe(420);
    expect(budget.recentContextChars).toBe(220);
  });

  test('persists telemetry samples and scopes budget by agent model', async () => {
    const scope = buildPromptCacheScope('coach', 'mimo-v2.5-pro', {
      personaVersion: 3,
      toolsetHash: 'abcdef12',
    });
    const stats = recordPromptCacheUsage(
      scope,
      { promptTokens: 1600, cachedPromptTokens: 1440, completionTokens: 120 },
      { agentId: 'coach', source: 'stream', model: 'mimo-v2.5-pro' }
    );

    expect(scope).toBe('coach:mimo-v2.5-pro:p3:tabcdef12');
    expect(stats.agentId).toBe('coach');
    expect(stats.averageHitRate).toBe(90);
    expect(stats.targetHitRate).toBe(90);
    expect(stats.advice.status).toBe('healthy');
    await Promise.resolve();
    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO prompt_cache_telemetry'),
      expect.arrayContaining(['coach:mimo-v2.5-pro:p3:tabcdef12', 'coach', 1600, 120, 1440, 90, 'stream', 'mimo-v2.5-pro'])
    );
  });

  test('records cache miss reason and recommends pressure handling', async () => {
    recordPromptCacheUsage(
      'master:mimo-v2.5-pro',
      { promptTokens: 1600, cachedPromptTokens: 0, completionTokens: 100 },
      { agentId: 'master', source: 'non_stream', model: 'mimo-v2.5-pro' }
    );
    const stats = recordPromptCacheUsage(
      'master:mimo-v2.5-pro',
      { promptTokens: 1600, cachedPromptTokens: 400, completionTokens: 80 },
      { agentId: 'master', source: 'stream', model: 'mimo-v2.5-pro' }
    );

    expect(stats.budgetPressure).toBe('tighten');
    expect(stats.advice.status).toBe('dynamic_pressure');
    await Promise.resolve();
    expect(mockRunAsync).toHaveBeenLastCalledWith(
      expect.stringContaining('miss_reason'),
      expect.arrayContaining(['dynamic_context_pressure'])
    );
  });

  test('hashes toolsets deterministically for cache scopes', () => {
    const first = hashToolsetForPromptCache([
      { definition: { name: 'search_bills' } },
      { definition: { name: 'add_bill' } },
    ] as any);
    const second = hashToolsetForPromptCache([
      { definition: { name: 'add_bill' } },
      { definition: { name: 'search_bills' } },
    ] as any);

    expect(first).toBe(second);
    expect(first).toHaveLength(8);
  });

  test('hydrates telemetry from SQLite and returns dashboard stats', async () => {
    mockGetAllAsync.mockResolvedValue([
      {
        id: 'pc_2',
        scope: 'master:mimo-v2.5-pro',
        agent_id: 'master',
        prompt_tokens: 1650,
        completion_tokens: 80,
        cached_prompt_tokens: 1600,
        hit_rate: 96.97,
        source: 'stream',
        model: 'mimo-v2.5-pro',
        created_at: '2026-06-05T08:00:02.000Z',
      },
      {
        id: 'pc_1',
        scope: 'master:mimo-v2.5-pro',
        agent_id: 'master',
        prompt_tokens: 1650,
        completion_tokens: 70,
        cached_prompt_tokens: 0,
        hit_rate: 0,
        source: 'non_stream',
        model: 'mimo-v2.5-pro',
        created_at: '2026-06-05T08:00:01.000Z',
      },
    ]);

    await hydratePromptCacheTelemetry({ agentId: 'master' });
    const dashboard = await getPromptCacheDashboard({ agentId: 'master' });

    expect(dashboard.stats[0].scope).toBe('master:mimo-v2.5-pro');
    expect(dashboard.stats[0].warmCalls).toBe(1);
    expect(dashboard.stats[0].averageHitRate).toBe(48.48);
    expect(dashboard.recent).toHaveLength(2);
    expect(dashboard.cost.savedPromptTokens).toBe(1600);
    expect(dashboard.cost.cacheSavingsRate).toBe(48.48);
    expect(dashboard.cost.estimatedUncachedCostUnits).toBe(3450);
    expect(dashboard.cost.savedCostUnits).toBeGreaterThan(0);
  });

  test('includes cold misses in runtime hit rate and budget pressure', () => {
    const scope = 'master:mimo-v2.5-pro';
    recordPromptCacheUsage(scope, { promptTokens: 1650, cachedPromptTokens: 0, completionTokens: 70 });
    const stats = recordPromptCacheUsage(scope, { promptTokens: 1650, cachedPromptTokens: 1600, completionTokens: 80 });

    expect(stats.averageHitRate).toBe(48.48);
    expect(stats.budgetPressure).toBe('tighten');
    expect(stats.recommendedBudget.adaptiveContextChars).toBeLessThan(420);
  });
});
