import { callCloudLLM, callCloudLLMStream, getCloudProviderCompatibility, resetForTest } from '../../core/cloud/api';
import { _resetAllForTest } from '../../core/safety/guard';

const runLive = process.env.RUN_LIVE_MIMO === '1' && Boolean(process.env.MIMO_API_KEY);
const maybeTest = runLive ? test : test.skip;
const baseUrl = process.env.MIMO_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1';
const model = process.env.MIMO_MODEL || 'mimo-v2.5-pro';
const apiKey = process.env.MIMO_API_KEY;
const financeTools = [
  {
    name: 'add_bill',
    description: '新增收入或支出账单',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        category: { type: 'string' },
        type: { type: 'string', enum: ['expense', 'income'] },
        merchant: { type: 'string' },
      },
      required: ['amount', 'type'],
    },
  },
  {
    name: 'set_budget',
    description: '设置某个分类的月度预算',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        limit: { type: 'number' },
        period: { type: 'string', enum: ['monthly'] },
      },
      required: ['category', 'limit'],
    },
  },
  {
    name: 'get_aggregation',
    description: '查询收入支出汇总',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', 'week', 'month'] },
      },
      required: ['period'],
    },
  },
];

function parseArgs(raw: string | undefined): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

describe('Live Mimo provider smoke', () => {
  beforeEach(() => {
    resetForTest();
    _resetAllForTest();
  });

  maybeTest('uses default tools mode and disabled thinking for function calls', async () => {
    const result = await callCloudLLM(
      {
        baseUrl,
        model,
        messages: [{ role: 'user', content: '记一笔交通支出 19 元' }],
        functions: [{
          name: 'add_bill',
          description: '新增账单',
          parameters: {
            type: 'object',
            properties: {
              amount: { type: 'number' },
              category: { type: 'string' },
              type: { type: 'string', enum: ['expense', 'income'] },
            },
            required: ['amount', 'type'],
          },
        }],
        temperature: 0,
        maxTokens: 120,
      },
      apiKey
    );

    expect(result.success).toBe(true);
    expect(result.response?.functionCall).toMatchObject({ name: 'add_bill' });
    expect(result.response?.usage.promptTokens).toBeGreaterThan(0);
    expect(getCloudProviderCompatibility()[0]).toMatchObject({
      preferredToolMode: 'tools',
      defaultThinkingDisabled: true,
    });
  }, 30000);

  maybeTest('streams text with final usage telemetry', async () => {
    const chunks = [];
    for await (const chunk of callCloudLLMStream(
      {
        baseUrl,
        model,
        messages: [{ role: 'user', content: '只输出一句话：记账测试成功' }],
        temperature: 0,
        maxTokens: 80,
      },
      apiKey
    )) {
      chunks.push(chunk);
    }

    const done = chunks.find((chunk) => chunk.type === 'done');
    const text = chunks
      .filter((chunk) => chunk.type === 'token')
      .map((chunk) => chunk.content || '')
      .join('');

    expect(text.length).toBeGreaterThan(0);
    expect(done?.usage?.promptTokens).toBeGreaterThan(0);
  }, 30000);

  maybeTest('streams tool calls without leaking pre-tool assistant text', async () => {
    const chunks = [];
    for await (const chunk of callCloudLLMStream(
      {
        baseUrl,
        model,
        messages: [{ role: 'user', content: '流式测试：记一笔午饭支出 32 元' }],
        functions: financeTools,
        temperature: 0,
        maxTokens: 120,
      },
      apiKey
    )) {
      chunks.push(chunk);
    }

    expect(chunks.find((chunk) => chunk.type === 'token')).toBeUndefined();
    expect(chunks.find((chunk) => chunk.type === 'function_call')?.functionCall?.name).toBe('add_bill');
    expect(chunks.find((chunk) => chunk.type === 'done')?.usage?.promptTokens).toBeGreaterThan(0);
  }, 30000);

  maybeTest('handles multi-turn finance dialogue with stable tool selection', async () => {
    const system = {
      role: 'system',
      content: [
        '你是 Wealth Manager 的 Master Agent。',
        '用户要求记账、预算、统计时必须调用工具，不要只口头确认。',
        '金额单位是人民币元。分类优先使用：餐饮、交通、购物、住房、娱乐、医疗、教育、水电、其他。',
      ].join('\n'),
    };
    const messages = [system];

    const firstUser = { role: 'user', content: '昨晚和朋友吃火锅花了268，帮我记一下' };
    const first = await callCloudLLM(
      { baseUrl, model, messages: [...messages, firstUser], functions: financeTools, temperature: 0, maxTokens: 160 },
      apiKey
    );
    expect(first.success).toBe(true);
    expect(first.response?.functionCall?.name).toBe('add_bill');
    expect(parseArgs(first.response?.functionCall?.arguments).amount).toBe(268);

    messages.push(firstUser, { role: 'assistant', content: '已记录餐饮支出 268 元。' });

    const secondUser = { role: 'user', content: '那这个月餐饮预算控制在800' };
    const second = await callCloudLLM(
      { baseUrl, model, messages: [...messages, secondUser], functions: financeTools, temperature: 0, maxTokens: 160 },
      apiKey
    );
    expect(second.success).toBe(true);
    expect(second.response?.functionCall?.name).toBe('set_budget');
    expect(parseArgs(second.response?.functionCall?.arguments).limit).toBe(800);

    messages.push(secondUser, { role: 'assistant', content: '已设置餐饮月预算 800 元。' });

    const third = await callCloudLLM(
      {
        baseUrl,
        model,
        messages: [...messages, { role: 'user', content: '看一下这个月总体花了多少' }],
        functions: financeTools,
        temperature: 0,
        maxTokens: 160,
      },
      apiKey
    );
    expect(third.success).toBe(true);
    expect(third.response?.functionCall?.name).toBe('get_aggregation');
    expect(parseArgs(third.response?.functionCall?.arguments).period).toBe('month');
  }, 60000);

  maybeTest('maps uncommon spending phrasing to the right tool', async () => {
    const result = await callCloudLLM(
      {
        baseUrl,
        model,
        messages: [
          {
            role: 'system',
            content: '你是 Wealth Manager 的 Master Agent。遇到用户表达消费、收入、预算、统计请求时必须调用最合适的工具。',
          },
          { role: 'user', content: '奶茶封印失败，刚刚又买了18块，帮我记上' },
        ],
        functions: financeTools,
        temperature: 0,
        maxTokens: 160,
      },
      apiKey
    );

    expect(result.success).toBe(true);
    expect(result.response?.functionCall?.name).toBe('add_bill');
    expect(parseArgs(result.response?.functionCall?.arguments).amount).toBe(18);
  }, 30000);

  maybeTest('returns cached prompt tokens for repeated stable prompts', async () => {
    const stablePrefix = Array.from(
      { length: 90 },
      (_, index) => `规则${index}: 你是 Wealth Manager 记账助手，分类、金额、预算、统计必须稳定处理。`
    ).join('\n');
    const request = {
      baseUrl,
      model,
      messages: [
        { role: 'system', content: stablePrefix },
        { role: 'user', content: '重复缓存测试：今天记账测试成功' },
      ],
      temperature: 0,
      maxTokens: 80,
      promptCacheKey: 'wealth-manager:live-mimo-cache-test',
      promptCacheRetention: '24h',
    };

    await callCloudLLM(request, apiKey);
    const second = await callCloudLLM(request, apiKey);

    expect(second.success).toBe(true);
    expect(second.response?.usage.promptTokens).toBeGreaterThan(0);
    expect(second.response?.usage.cachedPromptTokens || 0).toBeGreaterThan(0);
  }, 60000);
});
