jest.mock('../../core/database/database', () => {
  const mockDb = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: jest.fn(),
  };

  return {
    getDatabase: jest.fn().mockResolvedValue(mockDb),
  };
});

import { getDatabase } from '../../core/database/database';
import { record_repayment } from '../../tools/debt/debt.tool';

async function getMockDb() {
  return getDatabase() as any;
}

describe('record_repayment Tool', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    const mockDb = await getMockDb();
    mockDb.execAsync.mockResolvedValue(undefined);
    mockDb.runAsync.mockResolvedValue({ changes: 1 });
    mockDb.getFirstAsync.mockResolvedValue({ remaining: 100, principal: 200 });
  });

  test('rejects non-numeric repayment amounts before writing', async () => {
    const mockDb = await getMockDb();

    const result = await record_repayment({ debtId: 'debt-1', amount: 'abc' as any });

    expect(result.success).toBe(false);
    expect(result.error).toBe('还款金额必须大于0');
    expect(mockDb.execAsync).not.toHaveBeenCalled();
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  test('rejects repayments greater than the remaining debt', async () => {
    const mockDb = await getMockDb();

    const result = await record_repayment({ debtId: 'debt-1', amount: 101 });

    expect(result.success).toBe(false);
    expect(result.error).toBe('还款金额不能超过剩余金额');
    expect(mockDb.execAsync).toHaveBeenNthCalledWith(1, 'BEGIN IMMEDIATE TRANSACTION');
    expect(mockDb.execAsync).toHaveBeenNthCalledWith(2, 'COMMIT');
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  test('reads debt balance after acquiring write lock', async () => {
    const mockDb = await getMockDb();
    const calls: string[] = [];
    mockDb.execAsync.mockImplementation(async (sql: string) => {
      calls.push(sql);
    });
    mockDb.getFirstAsync.mockImplementation(async () => {
      calls.push('SELECT debt');
      return { remaining: 100, principal: 200 };
    });

    await record_repayment({ debtId: 'debt-1', amount: 40 });

    expect(calls).toEqual(['BEGIN IMMEDIATE TRANSACTION', 'SELECT debt', 'COMMIT']);
  });

  test('records repayment and updates debt inside a transaction', async () => {
    const mockDb = await getMockDb();

    const result = await record_repayment({ debtId: 'debt-1', amount: 40 });

    expect(result.success).toBe(true);
    expect((result.data as any).newRemaining).toBe(60);
    expect(mockDb.execAsync).toHaveBeenNthCalledWith(1, 'BEGIN IMMEDIATE TRANSACTION');
    expect(mockDb.execAsync).toHaveBeenNthCalledWith(2, 'COMMIT');
    expect(mockDb.runAsync).toHaveBeenCalledTimes(2);
  });

  test('rolls back when updating debt balance fails', async () => {
    const mockDb = await getMockDb();
    mockDb.runAsync
      .mockResolvedValueOnce({ changes: 1 })
      .mockRejectedValueOnce(new Error('update failed'));

    const result = await record_repayment({ debtId: 'debt-1', amount: 40 });

    expect(result.success).toBe(false);
    expect(result.error).toBe('记录还款时发生异常');
    expect(mockDb.execAsync).toHaveBeenNthCalledWith(1, 'BEGIN IMMEDIATE TRANSACTION');
    expect(mockDb.execAsync).toHaveBeenNthCalledWith(2, 'ROLLBACK');
  });
});
