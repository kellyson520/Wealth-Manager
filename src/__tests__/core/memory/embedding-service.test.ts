import { generateEmbedding, resetEmbeddingForTest, setEmbeddingApiKey } from '../../../core/memory/embedding/embedding-service';

describe('EmbeddingService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    setEmbeddingApiKey('');
    resetEmbeddingForTest();
  });

  test('sanitizes free text before sending it to cloud embeddings', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: { total_tokens: 3 },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    setEmbeddingApiKey('test-key');

    await generateEmbedding('email user@example.com about lunch', 3);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input).toBe('email *** about lunch');
  });
});
