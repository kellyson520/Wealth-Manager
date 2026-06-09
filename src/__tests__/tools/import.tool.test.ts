jest.mock('../../core/database/database', () => {
  const mockDb = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: jest.fn().mockResolvedValue(null),
  };

  return {
    getDatabase: jest.fn().mockResolvedValue(mockDb),
  };
});

jest.mock('../../core/hashchain/hashchain', () => ({
  generateHashForBill: jest.fn().mockResolvedValue('hash'),
}));

import { getDatabase } from '../../core/database/database';
import { generateHashForBill } from '../../core/hashchain/hashchain';
import { import_alipay, import_csv, import_wechat } from '../../tools/import/import.tool';

async function getMockDb() {
  return getDatabase() as any;
}

describe('import_csv Tool', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    const mockDb = await getMockDb();
    mockDb.execAsync.mockResolvedValue(undefined);
    mockDb.runAsync.mockResolvedValue({ changes: 1 });
    mockDb.getFirstAsync.mockResolvedValue(null);
    (generateHashForBill as jest.Mock).mockResolvedValue(true);
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
    expect(generateHashForBill).toHaveBeenCalledTimes(1);
    expect(generateHashForBill).toHaveBeenCalledWith(expect.any(String));
  });

  test('rolls back CSV record when hash generation fails', async () => {
    (generateHashForBill as jest.Mock).mockResolvedValue(false);

    const result = await import_csv({
      csvContent: [
        '商户,金额,类型,分类,日期',
        '咖啡店,32.5,支出,餐饮,2026-06-08',
      ].join('\n'),
      hasHeader: true,
    });

    const mockDb = await getMockDb();
    expect(result.success).toBe(true);
    expect((result.data as any).importedCount).toBe(0);
    expect((result.data as any).errorCount).toBe(1);
    expect((result.data as any).errors).toEqual([
      expect.objectContaining({ line: 2, error: 'Failed to generate bill hash' }),
    ]);
    expect(mockDb.execAsync).toHaveBeenCalledWith('BEGIN IMMEDIATE TRANSACTION');
    expect(mockDb.execAsync).toHaveBeenCalledWith('ROLLBACK');
    expect(mockDb.execAsync).not.toHaveBeenCalledWith('COMMIT');
  });

  test('imports quoted records that contain newlines in a field', async () => {
    const result = await import_csv({
      csvContent: [
        '商户,金额,类型,分类,日期,备注',
        '"咖啡店",32.5,支出,餐饮,2026-06-08,"第一行',
        '第二行"',
      ].join('\n'),
      hasHeader: true,
    });

    const mockDb = await getMockDb();
    expect(result.success).toBe(true);
    expect((result.data as any).importedCount).toBe(1);
    expect((result.data as any).errorCount).toBe(0);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync.mock.calls[0][1][4]).toBe('咖啡店');
    expect(mockDb.runAsync.mock.calls[0][1][7]).toBe('第一行\n第二行');
  });

  test('imports CSV with a custom single-character delimiter', async () => {
    const result = await import_csv({
      csvContent: [
        '商户;金额;类型;分类;日期',
        '咖啡店;32.5;支出;餐饮;2026-06-08',
      ].join('\n'),
      delimiter: ';',
      hasHeader: true,
    });

    const mockDb = await getMockDb();
    expect(result.success).toBe(true);
    expect((result.data as any).importedCount).toBe(1);
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.runAsync.mock.calls[0][1][4]).toBe('咖啡店');
  });

  test('rejects empty, multi-character, or newline CSV delimiters', async () => {
    const invalidDelimiters = ['', '||', '\n', '\r'];

    for (const delimiter of invalidDelimiters) {
      const result = await import_csv({
        csvContent: '商户,金额\n咖啡店,32.5',
        delimiter,
        hasHeader: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('CSV分隔符必须是单个非换行字符');
    }

    const mockDb = await getMockDb();
    expect(mockDb.runAsync).not.toHaveBeenCalled();
    expect(generateHashForBill).not.toHaveBeenCalled();
  });

  test('rolls back WeChat import when hash generation fails', async () => {
    (generateHashForBill as jest.Mock).mockResolvedValue(false);

    const result = await import_wechat({ rawText: '咖啡店 - ¥32.5' });

    const mockDb = await getMockDb();
    expect(result.success).toBe(false);
    expect(result.error).toBe('导入微信账单时发生异常');
    expect(mockDb.execAsync).toHaveBeenCalledWith('BEGIN IMMEDIATE TRANSACTION');
    expect(mockDb.execAsync).toHaveBeenCalledWith('ROLLBACK');
    expect(mockDb.execAsync).not.toHaveBeenCalledWith('COMMIT');
  });

  test('rolls back Alipay import when hash generation fails', async () => {
    (generateHashForBill as jest.Mock).mockResolvedValue(false);

    const result = await import_alipay({ rawText: '咖啡店 - ¥32.5' });

    const mockDb = await getMockDb();
    expect(result.success).toBe(false);
    expect(result.error).toBe('导入支付宝账单时发生异常');
    expect(mockDb.execAsync).toHaveBeenCalledWith('BEGIN IMMEDIATE TRANSACTION');
    expect(mockDb.execAsync).toHaveBeenCalledWith('ROLLBACK');
    expect(mockDb.execAsync).not.toHaveBeenCalledWith('COMMIT');
  });

  test('CSV import skips duplicate bills (same date, amount, merchant, type)', async () => {
    const mockDb = await getMockDb();
    // First record: no existing bill → import normally
    // Second record: existing bill found → duplicate
    mockDb.getFirstAsync
      .mockResolvedValueOnce(null)        // first row: no duplicate
      .mockResolvedValueOnce({ id: 'x' }); // second row: duplicate found

    const result = await import_csv({
      csvContent: [
        '商户,金额,类型,分类,日期',
        '咖啡店,32.5,支出,餐饮,2026-06-08',
        '咖啡店,32.5,支出,餐饮,2026-06-08',
      ].join('\n'),
      hasHeader: true,
    });

    expect(result.success).toBe(true);
    expect((result.data as any).importedCount).toBe(1);
    expect((result.data as any).duplicateCount).toBe(1);
    expect((result.data as any).duplicates).toHaveLength(1);
    expect((result.data as any).duplicates[0]).toEqual(
      expect.objectContaining({ merchant: '咖啡店', amount: 32.5 })
    );
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1); // only one INSERT
  });

  test('WeChat import skips duplicate bills', async () => {
    const mockDb = await getMockDb();
    mockDb.getFirstAsync.mockResolvedValue({ id: 'existing-id' });

    const result = await import_wechat({ rawText: '咖啡店 - ¥32.5' });

    expect(result.success).toBe(true);
    expect((result.data as any).importedCount).toBe(0);
    expect((result.data as any).duplicateCount).toBe(1);
    expect((result.data as any).duplicates).toHaveLength(1);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  test('Alipay import skips duplicate bills', async () => {
    const mockDb = await getMockDb();
    mockDb.getFirstAsync.mockResolvedValue({ id: 'existing-id' });

    const result = await import_alipay({ rawText: '咖啡店 - ¥32.5' });

    expect(result.success).toBe(true);
    expect((result.data as any).importedCount).toBe(0);
    expect((result.data as any).duplicateCount).toBe(1);
    expect((result.data as any).duplicates).toHaveLength(1);
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  test('CSV import deduplication uses correct query parameters', async () => {
    const mockDb = await getMockDb();
    mockDb.getFirstAsync.mockResolvedValue(null);

    await import_csv({
      csvContent: [
        '商户,金额,类型,分类,日期',
        '星巴克,45.00,支出,餐饮,2026-06-10',
      ].join('\n'),
      hasHeader: true,
    });

    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      `SELECT id FROM bills WHERE date = ? AND amount = ? AND merchant = ? AND type = ? LIMIT 1`,
      ['2026-06-10', 45, '星巴克', 'expense']
    );
  });
});
