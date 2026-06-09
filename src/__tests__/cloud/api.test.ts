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
    test('rejects insecure custom base URL before sending API key', async () => {
      const result = await callCloudLLM(
        {
          baseUrl: 'http://token-plan-cn.xiaomimimo.com/v1',
          messages: [{ role: 'user', content: 'clean text' }],
        },
        'test-key'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTPS');
      expect(result.degraded).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('rejects local or private custom base URL before sending API key', async () => {
      const blockedUrls = [
        'https://localhost./v1',
        'https://127.0.0.1:11434/v1',
        'https://10.0.0.5/v1',
        'https://172.16.0.5/v1',
        'https://192.168.1.5/v1',
        'https://[fd00::1]/v1',
        'https://[fe80::1]/v1',
        'https://[::ffff:7f00:1]/v1',
        'https://[::ffff:a00:5]/v1',
        'https://[::ffff:c0a8:105]/v1',
      ];

      for (const baseUrl of blockedUrls) {
        const result = await callCloudLLM(
          {
            baseUrl,
            messages: [{ role: 'user', content: 'clean text' }],
          },
          'test-key'
        );

        expect(result.success).toBe(false);
        expect(result.degraded).toBe(true);
      }
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('rejects untrusted custom base URL host before sending API key', async () => {
      const blockedUrls = [
        'https://attacker-controlled.example/v1',
        'https://93.184.216.34/v1',
        'https://[2606:2800:220:1:248:1893:25c8:1946]/v1',
        'https://[::ffff:5db8:d822]/v1',
      ];

      for (const baseUrl of blockedUrls) {
        const result = await callCloudLLM(
          {
            baseUrl,
            messages: [{ role: 'user', content: 'clean text' }],
          },
          'test-key'
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('允许列表');
        expect(result.degraded).toBe(true);
      }
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('rejects custom base URL credentials before sending API key', async () => {
      const result = await callCloudLLM(
        {
          baseUrl: 'https://user:pass@token-plan-cn.xiaomimimo.com/v1',
          messages: [{ role: 'user', content: 'clean text' }],
        },
        'test-key'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('用户名或密码');
      expect(result.degraded).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('uses custom base URL, model, max_completion_tokens and thinking config', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'AI_CONNECTIVITY_OK' } }],
            model: 'mimo-v2.5-pro',
            usage: { total_tokens: 12, prompt_tokens: 7, completion_tokens: 5 },
          }),
      });

      const result = await callCloudLLM(
        {
          baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
          model: 'mimo-v2.5-pro',
          tokenParam: 'max_completion_tokens',
          thinking: { type: 'disabled' },
          messages: [{ role: 'user', content: 'clean text' }],
          maxTokens: 100,
        },
        'test-key'
      );

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
        expect.objectContaining({
          redirect: 'error',
          body: expect.stringContaining('"max_completion_tokens":100'),
        })
      );
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.model).toBe('mimo-v2.5-pro');
      expect(body.thinking).toEqual({ type: 'disabled' });
      expect(body.max_tokens).toBeUndefined();
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
  });


  describe('streaming API', () => {
    test('emits a single done event for OpenAI-compatible SSE completion', async () => {
      const encoder = new TextEncoder();
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode('data: {"choices":[{"delta":{"content":"hello"}}],"usage":{"total_tokens":3}}\n\n')
            );
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        }),
      });

      const chunks = [];
      for await (const chunk of callCloudLLMStream(
        { messages: [{ role: 'user', content: 'clean text' }] },
        'test-key'
      )) {
        chunks.push(chunk);
      }

      expect(chunks.filter((chunk) => chunk.type === 'done')).toHaveLength(1);
      expect(chunks).toContainEqual({ type: 'token', content: 'hello' });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({ redirect: 'error' })
      );
    });

    test('processes a final SSE frame without a trailing newline', async () => {
      const encoder = new TextEncoder();
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode('data: {"choices":[{"delta":{"content":"tail"}}],"usage":{"total_tokens":3}}')
            );
            controller.close();
          },
        }),
      });

      const chunks = [];
      for await (const chunk of callCloudLLMStream(
        { messages: [{ role: 'user', content: 'clean text' }] },
        'test-key'
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toContainEqual({ type: 'token', content: 'tail' });
      expect(chunks.filter((chunk) => chunk.type === 'done')).toHaveLength(1);
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
