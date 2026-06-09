jest.mock('../../core/database/database', () => {
  const mockDb = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn().mockResolvedValue([]),
  };

  return {
    getDatabase: jest.fn().mockResolvedValue(mockDb),
  };
});

import { getDatabase } from '../../core/database/database';
import { add_asset, transfer_asset, update_asset_value, list_assets } from '../../tools/assets/assets.tool';

async function getMockDb() {
  return getDatabase() as any;
}

describe('assets tool', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    const db = await getMockDb();
    db.execAsync.mockResolvedValue(undefined);
    db.runAsync.mockResolvedValue({ changes: 1 });
    db.getFirstAsync
      .mockResolvedValueOnce({ id: 'asset-from', name: '现金', amount: 500, type: '现金' })
      .mockResolvedValueOnce({ id: 'asset-to', name: '银行卡', amount: 100 });
  });

  test('transfers assets inside a transaction', async () => {
    const result = await transfer_asset({
      fromAssetId: 'asset-from',
      toAssetId: 'asset-to',
      amount: 150,
    });

    const db = await getMockDb();
    expect(result.success).toBe(true);
    expect(db.execAsync).toHaveBeenNthCalledWith(1, 'BEGIN IMMEDIATE TRANSACTION');
    expect(db.execAsync).toHaveBeenNthCalledWith(2, 'COMMIT');
    expect(db.runAsync).toHaveBeenCalledTimes(2);
  });

  test('rolls back when crediting the destination asset fails', async () => {
    const db = await getMockDb();
    db.runAsync
      .mockResolvedValueOnce({ changes: 1 })
      .mockRejectedValueOnce(new Error('disk full'));

    const result = await transfer_asset({
      fromAssetId: 'asset-from',
      toAssetId: 'asset-to',
      amount: 150,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('转账时发生异常');
    expect(db.execAsync).toHaveBeenNthCalledWith(1, 'BEGIN IMMEDIATE TRANSACTION');
    expect(db.execAsync).toHaveBeenNthCalledWith(2, 'ROLLBACK');
  });

  test('rolls back and does not credit when debit cannot reserve funds', async () => {
    const db = await getMockDb();
    db.runAsync.mockResolvedValueOnce({ changes: 0 });

    const result = await transfer_asset({
      fromAssetId: 'asset-from',
      toAssetId: 'asset-to',
      amount: 150,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('现金 余额不足 (当前: 500, 需转: 150)');
    expect(db.execAsync).toHaveBeenNthCalledWith(1, 'BEGIN IMMEDIATE TRANSACTION');
    expect(db.execAsync).toHaveBeenNthCalledWith(2, 'ROLLBACK');
    expect(db.runAsync).toHaveBeenCalledTimes(1);
  });

  test('rejects invalid asset types before inserting', async () => {
    const db = await getMockDb();

    const result = await add_asset({
      name: 'BTC',
      type: 'crypto',
      amount: 1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('资产类型无效');
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  test('rejects negative asset value updates', async () => {
    const db = await getMockDb();

    const result = await update_asset_value({
      assetId: 'asset-from',
      amount: -1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('资产金额必须为非负数');
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  test('rejects invalid asset list limits', async () => {
    const db = await getMockDb();

    const result = await list_assets({ limit: -1 });

    expect(result.success).toBe(false);
    expect(result.error).toBe('查询数量必须为正整数');
    expect(db.getAllAsync).not.toHaveBeenCalled();
  });
});
