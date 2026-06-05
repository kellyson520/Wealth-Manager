import { callCloudLLM, callCloudLLMStream, resetForTest, setTokenBudget } from '../../core/cloud/api';
import { _resetAllForTest } from '../../core/safety/guard';

global.fetch = jest.fn();

describe('Cloud LLM API - Safety Chain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetForTest();
    _resetAllForTest();
  });

  describe('API key not configured', () => {
    test('returns degraded=true without API key', async () => {
      const result = await callCloudLLM({
        messages: [{ role: 'user', content: '分析消费趋势' }],
      });

      expect(result.success).toBe(false);
      expect(result.degraded).toBe(true);
      expect(result.error).toContain('未配置云端 API 密钥');
    });

    test('does not make network call without API key', async () => {
      await callCloudLLM({
        messages: [{ role: 'user', content: '分析消费趋势' }],
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('PII detection blocks upload', () => {
    test('blocks credit card number in message', async () => {
      const result = await callCloudLLM(
        {
          messages: [{ role: 'user', content: '我的卡号4111111111111111花了100元' }],
        },
        'test-key'
      );

      expect(result.success).toBe(false);
      expect(result.degraded).toBe(true);
      expect(result.error).toContain('敏感信息');
      expect(result.error).toContain('credit_card');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('blocks phone number in message', async () => {
      const result = await callCloudLLM(
        {
          messages: [{ role: 'user', content: '联系电话13812345678，消费记录' }],
        },
        'test-key'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('phone');
    });

    test('blocks email in message', async () => {
      const result = await callCloudLLM(
        {
          messages: [{ role: 'user', content: '邮箱 test@example.com 的账单' }],
        },
        'test-key'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('email');
    });

    test('blocks ID card in message', async () => {
      const result = await callCloudLLM(
        {
          messages: [{ role: 'user', content: '身份证110101199001011234关联账户' }],
        },
        'test-key'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('id_card');
    });

    test('blocks credential keywords', async () => {
      const result = await callCloudLLM(
        {
          messages: [{ role: 'user', content: 'my password is admin123' }],
        },
        'test-key'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('credential_keyword');
    });

    test('clean financial data passes through', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '分析结果' } }],
            model: 'gpt-4o',
            usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 },
          }),
      });

      const result = await callCloudLLM(
        {
          messages: [{ role: 'user', content: '今天消费了100元在餐饮上，趋势如何' }],
        },
        'test-key'
      );

      expect(result.success).toBe(true);
      expect(result.degraded).toBe(false);
    });
  });

  describe('circuit breaker integration', () => {
    test('blocks after repeated failures', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      for (let i = 0; i < 5; i++) {
        await callCloudLLM(
          { messages: [{ role: 'user', content: 'clean text' }] },
          'test-key'
        );
      }

      const result = await callCloudLLM(
        { messages: [{ role: 'user', content: 'clean text' }] },
        'test-key'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('熔断保护');
      expect(result.degraded).toBe(true);
    });

    test('allows calls when circuit is closed', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'OK' } }],
            model: 'gpt-4o',
            usage: { total_tokens: 10 },
          }),
      });

      const result = await callCloudLLM(
        { messages: [{ role: 'user', content: 'clean text' }] },
        'test-key'
      );

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('token budget integration', () => {
    test('tracks token usage across calls', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'OK' } }],
            model: 'gpt-4o',
            usage: { total_tokens: 5000 },
          }),
      });

      await callCloudLLM(
        { messages: [{ role: 'user', content: 'clean text' }] },
        'test-key'
      );
      await callCloudLLM(
        { messages: [{ role: 'user', content: 'clean text' }] },
        'test-key'
      );

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('blocks when budget is exhausted', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'OK' } }],
            model: 'gpt-4o',
            usage: { total_tokens: 1000 },
          }),
      });

      setTokenBudget({ used: 49000 });

      await callCloudLLM(
        { messages: [{ role: 'user', content: 'clean text' }] },
        'test-key'
      );

      const result = await callCloudLLM(
        { messages: [{ role: 'user', content: 'clean text' }] },
        'test-key'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('已用完');
      expect(result.degraded).toBe(true);
    });
  });

  describe('API error handling', () => {
    test('handles HTTP 429 rate limit from LLM', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 429,
      });

      const result = await callCloudLLM(
        { messages: [{ role: 'user', content: 'clean text' }] },
        'test-key'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('429');
      expect(result.degraded).toBe(true);
    });

    test('handles HTTP 500 server error', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await callCloudLLM(
        { messages: [{ role: 'user', content: 'clean text' }] },
        'test-key'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
    });

    test('handles network timeout/error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network timeout'));

      const result = await callCloudLLM(
        { messages: [{ role: 'user', content: 'clean text' }] },
        'test-key'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('网络异常');
      expect(result.degraded).toBe(true);
    });
  });

  describe('OpenAI-compatible provider options', () => {
    test('uses custom base URL, model, max_completion_tokens and thinking config', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'AI_CONNECTIVITY_OK' } }],
            model: 'mimo-v2.5-pro',
            usage: {
              total_tokens: 12,
              prompt_tokens: 7,
              completion_tokens: 5,
              prompt_tokens_details: { cached_tokens: 4 },
            },
          }),
      });

      const result = await callCloudLLM(
        {
          baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
          model: 'mimo-v2.5-pro',
          tokenParam: 'max_completion_tokens',
          thinking: { type: 'disabled' },
          promptCacheKey: 'wealth-manager-master',
          promptCacheRetention: '24h',
          messages: [{ role: 'user', content: 'clean text' }],
          maxTokens: 100,
        },
        'test-key'
      );

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
        expect.objectContaining({
          body: expect.stringContaining('"max_completion_tokens":100'),
        })
      );
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.model).toBe('mimo-v2.5-pro');
      expect(body.thinking).toEqual({ type: 'disabled' });
      expect(body.prompt_cache_key).toBe('wealth-manager-master');
      expect(body.prompt_cache_retention).toBe('24h');
      expect(body.max_tokens).toBeUndefined();
      expect(result.response?.usage.cachedPromptTokens).toBe(4);
    });

    test('sends tools format and parses tool_calls response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{
              message: {
                content: '',
                tool_calls: [{
                  type: 'function',
                  function: { name: 'get_total', arguments: '{"period":"today"}' },
                }],
              },
            }],
            model: 'mimo-v2.5-pro',
            usage: { total_tokens: 20 },
          }),
      });

      const result = await callCloudLLM(
        {
          messages: [{ role: 'user', content: 'clean text' }],
          toolMode: 'tools',
          functions: [{
            name: 'get_total',
            description: '获取统计',
            parameters: { type: 'object' },
          }],
        },
        'test-key'
      );

      expect(result.response?.functionCall).toEqual({
        name: 'get_total',
        arguments: '{"period":"today"}',
      });
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.tools[0].function.name).toBe('get_total');
      expect(body.functions).toBeUndefined();
    });

    test('parses stream usage and cached prompt tokens', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"OK"}}]}\n',
        'data: {"choices":[],"usage":{"total_tokens":1800,"prompt_tokens":1650,"completion_tokens":150,"prompt_tokens_details":{"cached_tokens":1600}}}\n',
        'data: [DONE]\n',
      ];
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: makeStreamBody(chunks),
      });

      const events = [];
      for await (const chunk of callCloudLLMStream(
        {
          baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
          model: 'mimo-v2.5-pro',
          messages: [{ role: 'user', content: 'clean text' }],
        },
        'test-key'
      )) {
        events.push(chunk);
      }

      expect(events[0]).toEqual({ type: 'token', content: 'OK' });
      expect(events[events.length - 1]).toEqual({
        type: 'done',
        usage: {
          promptTokens: 1650,
          completionTokens: 150,
          cachedPromptTokens: 1600,
        },
      });
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.stream_options).toEqual({ include_usage: true });
    });

    test('retries stream without usage option when provider rejects stream_options', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 400 })
        .mockResolvedValueOnce({
          ok: true,
          body: makeStreamBody([
            'data: {"choices":[{"delta":{"content":"OK"}}]}\n',
            'data: [DONE]\n',
          ]),
        });

      const events = [];
      for await (const chunk of callCloudLLMStream(
        { messages: [{ role: 'user', content: 'clean text' }] },
        'test-key'
      )) {
        events.push(chunk);
      }

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).stream_options).toEqual({ include_usage: true });
      expect(JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body).stream_options).toBeUndefined();
      expect(events[0]).toEqual({ type: 'token', content: 'OK' });
    });
  });

  describe('degradation indicator', () => {
    test('degraded=true means app should fall back to local', async () => {
      const testCases = [
        { desc: 'no key', key: undefined },
        { desc: 'PII detected', key: 'test-key', content: '卡号4111111111111111' },
        { desc: 'budget exhausted', key: 'test-key', preUsed: 50000 },
        { desc: 'circuit open', key: 'test-key', preFailures: 5 },
      ];

      for (const tc of testCases) {
        if (tc.preUsed) setTokenBudget({ used: tc.preUsed });
        if (tc.preFailures) {
          (global.fetch as jest.Mock).mockRejectedValue(new Error('fail'));
          for (let i = 0; i < tc.preFailures; i++) {
            await callCloudLLM(
              { messages: [{ role: 'user', content: 'clean text' }] },
              'test-key'
            );
          }
        }

        const result = await callCloudLLM(
          { messages: [{ role: 'user', content: tc.content || 'clean text' }] },
          tc.key
        );

        expect(result.degraded).toBe(true);
        resetForTest();
      }
    });
  });
});

function makeStreamBody(chunks: string[]) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    getReader: () => ({
      read: jest.fn().mockImplementation(() => {
        if (index >= chunks.length) return Promise.resolve({ done: true });
        return Promise.resolve({ done: false, value: encoder.encode(chunks[index++]) });
      }),
    }),
  };
}
