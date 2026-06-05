import {
  buildCacheOptimizedMessages,
  buildPromptCacheMetrics,
  sortToolsForPromptCache,
} from '../../core/cloud/prompt-cache';

describe('prompt cache planning', () => {
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
});
