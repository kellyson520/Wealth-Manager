jest.mock('../../core/database/database', () => {
  const mockDb = {
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  };

  return {
    getDatabase: jest.fn().mockResolvedValue(mockDb),
  };
});

import { getDatabase } from '../../core/database/database';
import { import_csv } from '../../tools/import/import.tool';

async function getMockDb() {
  return getDatabase() as any;
}

describe('import_csv Tool', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    const mockDb = await getMockDb();
    mockDb.runAsync.mockResolvedValue({ changes: 1 });
  });

  test('rejects partial and non-finite amount values', async () => {
    const result = await import_csv({
      csvContent: [
        '商户,金额,类型,分类,日期',
        '合法商户,12.50,支出,餐饮,2026-06-08',
        '部分数字,12abc,支出,餐饮,2026-06-08',
        '无穷大,Infinity,支出,餐饮,2026-06-08',
      ].join('\n'),
      hasHeader: true,
    });

    const mockDb = await getMockDb();
    expect(result.success).toBe(true);
    expect((result.data as any).importedCount).toBe(1);
    expect((result.data as any).errorCount).toBe(2);
    expect((result.data as any).errors).toEqual([
      expect.objectContaining({ line: 3, error: '金额无效' }),
      expect.objectContaining({ line: 4, error: '金额无效' }),
    ]);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync.mock.calls[0][1][1]).toBe(12.5);
  });
});
