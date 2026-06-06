import { callCloudLLM, callCloudLLMStream, getCloudProviderCompatibility, resetForTest } from '../../core/cloud/api';
import { _resetAllForTest } from '../../core/safety/guard';

const runLive = process.env.RUN_LIVE_MIMO === '1' && Boolean(process.env.MIMO_API_KEY);
const maybeTest = runLive ? test : test.skip;
const baseUrl = process.env.MIMO_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1';
const model = process.env.MIMO_MODEL || 'mimo-v2.5-pro';
const apiKey = process.env.MIMO_API_KEY;

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
});
