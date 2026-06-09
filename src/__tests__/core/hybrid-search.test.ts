const mockDb = {
  getAllAsync: jest.fn(),
};

jest.mock('../../core/database/database', () => ({
  getDatabase: jest.fn().mockResolvedValue(mockDb),
}));

jest.mock('../../core/logger/logger', () => ({
  captureError: jest.fn(),
}));

import { hybridSearch } from '../../core/memory/retrieval/hybrid-search';

describe('hybridSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not return memory BM25 results for non-memory source filters', async () => {
    mockDb.getAllAsync.mockImplementation((sql: string) => {
      if (sql.includes('vector_store')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        {
          id: 'memory-1',
          content: 'groceries budget',
          metadata: '{}',
          source_type: 'memory_engine',
          source_id: 'groceries budget',
        },
      ]);
    });

    const results = await hybridSearch('groceries', {
      sourceType: 'fact',
      vectorWeight: 0,
      bm25Weight: 1,
    });

    expect(results).toEqual([]);
  });
});
