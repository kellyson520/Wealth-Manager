import {
  buildCacheOptimizedMessages,
  buildPromptCacheMetrics,
  splitAdaptiveContextForCache,
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
});
