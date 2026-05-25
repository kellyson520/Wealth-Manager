import {
  buildPrompt,
  buildLayeredPrompt,
  truncateToTokenBudget,
  estimateTokenCount,
  DEFAULT_PROMPT_LAYERS,
} from '../../core/cloud/prompts/prompt-builder';
import type { AgentId } from '../../shared/types';

describe('PromptBuilder', () => {
  it('should build a master prompt with default layers', () => {
    const prompt = buildPrompt({
      agentId: 'master' as AgentId,
      agentName: 'Master',
      basePrompt: DEFAULT_PROMPT_LAYERS.master.system,
    });

    expect(prompt).toContain('主控 Agent');
    expect(prompt).toContain('约束规则');
  });

  it('should inject context variables', () => {
    const prompt = buildPrompt({
      agentId: 'master' as AgentId,
      agentName: 'Master',
      basePrompt: DEFAULT_PROMPT_LAYERS.master.system,
      context: '用户刚才问了本月消费情况',
      userProfile: 'VIP用户',
      personaPrompt: '你是一位专业财务顾问',
    });

    expect(prompt).toContain('本月消费情况');
    expect(prompt).toContain('VIP用户');
  });

  it('should inject tool list', () => {
    const prompt = buildPrompt({
      agentId: 'ledger' as AgentId,
      agentName: 'Ledger',
      basePrompt: DEFAULT_PROMPT_LAYERS.ledger.system,
      toolList: 'add_bill, search_bills, get_aggregation',
    });

    expect(prompt).toContain('add_bill, search_bills, get_aggregation');
  });

  it('should build layered prompt', () => {
    const prompt = buildLayeredPrompt({
      agentId: 'coach' as AgentId,
      agentName: 'Coach',
      basePrompt: DEFAULT_PROMPT_LAYERS.coach.system,
      toolList: 'set_budget, create_savings_goal',
    });

    expect(prompt).toContain('教练 Agent');
    expect(prompt).toContain('set_budget');
  });

  it('should use master default for unknown agent', () => {
    const prompt = buildPrompt({
      agentId: 'nonexistent' as AgentId,
      agentName: 'Unknown',
      basePrompt: 'Fallback prompt',
    });

    expect(prompt).toContain('主控 Agent');
  });
});

describe('TokenBudget', () => {
  it('should estimate token count for English text', () => {
    const tokens = estimateTokenCount('Hello world this is a test');
    expect(tokens).toBeGreaterThan(0);
  });

  it('should estimate token count for Chinese text', () => {
    const tokens = estimateTokenCount('你好世界这是一个测试');
    expect(tokens).toBeGreaterThan(0);
  });

  it('should count Chinese characters as higher weight than ASCII', () => {
    const cnTokens = estimateTokenCount('你好世界');
    const enTokens = estimateTokenCount('hello');
    expect(cnTokens).toBeGreaterThan(enTokens);
  });

  it('should not truncate text under budget', () => {
    const text = 'Short text';
    const truncated = truncateToTokenBudget(text, 1000);
    expect(truncated).toBe(text);
  });

  it('should truncate text over budget', () => {
    const text = 'A'.repeat(10000);
    const truncated = truncateToTokenBudget(text, 100);
    expect(truncated.length).toBeLessThan(text.length);
  });
});
