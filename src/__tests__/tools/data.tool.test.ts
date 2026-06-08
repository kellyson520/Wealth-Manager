jest.mock('expo-file-system', () => ({
  documentDirectory: 'file://docs/',
  EncodingType: { UTF8: 'utf8' },
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
}), { virtual: true });

jest.mock('../../core/database/database', () => {
  const mockDb = {
    getAllAsync: jest.fn(),
  };

  return {
    getDatabase: jest.fn().mockResolvedValue(mockDb),
  };
});

jest.mock('../../core/logger/logger', () => ({
  captureError: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'backup-id'),
}));

import * as FileSystem from 'expo-file-system';
import { create_backup, export_csv, export_json } from '../../tools/data/data.tool';
import * as db from '../../core/database/database';

async function getMockDb() {
  return db.getDatabase() as any;
}

function getLastSavedContent(): string {
  const writeMock = FileSystem.writeAsStringAsync as jest.Mock;
  return writeMock.mock.calls[writeMock.mock.calls.length - 1][1];
}

describe('data export tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('export_csv', () => {
    test('excludes sensitive bill fields from the saved CSV and tool result', async () => {
      const mockDb = await getMockDb();
      mockDb.getAllAsync.mockResolvedValue([
        {
          date: '2026-06-08',
          type: 'expense',
          category: '餐饮',
          amount: 35,
          merchant: '敏感商户',
          note: '身份证 110101199003071234',
          tags: '私人标签',
          raw_description: '微信支付详情',
          hash: 'secret-hash',
          prev_hash: 'secret-prev-hash',
        },
      ]);

      const result = await export_csv({ startDate: '2026-06-01', endDate: '2026-06-30' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expect.objectContaining({ rowCount: 1, filePath: expect.any(String) }));
      expect(result.data).not.toHaveProperty('csvContent');

      const csv = getLastSavedContent();
      expect(csv).toContain('日期,类型,分类,金额');
      expect(csv).toContain('2026-06-08,支出,餐饮,35.00');
      expect(csv).not.toContain('敏感商户');
      expect(csv).not.toContain('身份证');
      expect(csv).not.toContain('私人标签');
      expect(csv).not.toContain('secret-hash');

      const query = mockDb.getAllAsync.mock.calls[0][0];
      expect(query).toContain('SELECT date, type, category, amount FROM bills');
      expect(mockDb.getAllAsync.mock.calls[0][1]).toEqual(['2026-06-01', '2026-06-30']);
    });

    test('returns failure when CSV file cannot be saved', async () => {
      const mockDb = await getMockDb();
      mockDb.getAllAsync.mockResolvedValue([]);
      (FileSystem.writeAsStringAsync as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

      const result = await export_csv();

      expect(result.success).toBe(false);
      expect(result.error).toBe('保存CSV文件失败');
    });
  });

  describe('export_json', () => {
    test('saves only safe bill fields and does not return JSON content to the LLM', async () => {
      const mockDb = await getMockDb();
      mockDb.getAllAsync.mockResolvedValue([
        {
          id: 'bill-1',
          date: '2026-06-08',
          type: 'income',
          category: '工资',
          amount: 12000,
          merchant: '公司名称',
          note: '银行卡 6222020000000000000',
          raw_description: '工资明细',
          source: 'import',
          created_at: '2026-06-08T00:00:00.000Z',
          hash: 'secret-hash',
          prev_hash: 'secret-prev-hash',
        },
      ]);

      const result = await export_json();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expect.objectContaining({ billCount: 1, filePath: expect.any(String) }));
      expect(result.data).not.toHaveProperty('jsonContent');

      const saved = JSON.parse(getLastSavedContent());
      expect(saved.billCount).toBe(1);
      expect(saved.bills).toEqual([
        { date: '2026-06-08', type: 'income', category: '工资', amount: 12000 },
      ]);
      expect(getLastSavedContent()).not.toContain('公司名称');
      expect(getLastSavedContent()).not.toContain('银行卡');
      expect(getLastSavedContent()).not.toContain('secret-hash');
    });

    test('returns failure when JSON file cannot be saved', async () => {
      const mockDb = await getMockDb();
      mockDb.getAllAsync.mockResolvedValue([]);
      (FileSystem.writeAsStringAsync as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

      const result = await export_json();

      expect(result.success).toBe(false);
      expect(result.error).toBe('保存JSON文件失败');
    });
  });

  describe('create_backup', () => {
    test('sanitizes every table before saving backup and omits backup content from result', async () => {
      const mockDb = await getMockDb();
      mockDb.getAllAsync.mockImplementation(async (query: string) => {
        if (query.includes('FROM bills')) {
          return [{ id: 'bill-1', date: '2026-06-08', type: 'expense', category: '餐饮', amount: 35, merchant: '敏感商户', note: '手机号 13800138000', hash: 'hash' }];
        }
        if (query.includes('FROM debts')) {
          return [{ id: 'debt-1', title: '私人借款', type: '借入', principal: 1000, remaining: 500, counterparty: '张三', note: '身份证 110101199003071234' }];
        }
        if (query.includes('FROM assets')) {
          return [{ id: 'asset-1', name: '招商银行卡', type: '银行账户', amount: 20000, currency: 'CNY', note: '卡号 6222020000000000000' }];
        }
        if (query.includes('FROM classification_rules')) {
          return [{ id: 'rule-1', name: '敏感商户规则', conditions: '{"value":"私人医院"}', actions: '{"category":"医疗"}', priority: 10, enabled: 1 }];
        }
        if (query.includes('FROM reimbursement_tasks')) {
          return [{ id: 'reim-1', title: '体检报销', amount: 300, category: '医疗', status: 'pending', merchant: '私人医院', note: '病历号 123' }];
        }
        return [];
      });

      const result = await create_backup();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expect.objectContaining({ backupId: 'backup-id', tableCount: 12, filePath: expect.any(String) }));
      expect(result.data).not.toHaveProperty('backupContent');

      const backupText = getLastSavedContent();
      const backup = JSON.parse(backupText);
      expect(backup._metadata.sanitized).toBe(true);
      expect(backup.bills).toEqual([{ date: '2026-06-08', type: 'expense', category: '餐饮', amount: 35 }]);
      expect(backup.debts).toEqual([{ type: '借入', principal: 1000, remaining: 500 }]);
      expect(backup.assets).toEqual([{ type: '银行账户', amount: 20000, currency: 'CNY' }]);
      expect(backup.classification_rules).toEqual([{ priority: 10, enabled: 1 }]);
      expect(backup.reimbursement_tasks).toEqual([{ amount: 300, category: '医疗', status: 'pending' }]);

      expect(backupText).not.toContain('敏感商户');
      expect(backupText).not.toContain('张三');
      expect(backupText).not.toContain('招商银行卡');
      expect(backupText).not.toContain('私人医院');
      expect(backupText).not.toContain('13800138000');
      expect(backupText).not.toContain('6222020000000000000');
      expect(backupText).not.toContain('hash');
    });

    test('returns failure when backup file cannot be saved', async () => {
      const mockDb = await getMockDb();
      mockDb.getAllAsync.mockResolvedValue([]);
      (FileSystem.writeAsStringAsync as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

      const result = await create_backup();

      expect(result.success).toBe(false);
      expect(result.error).toBe('保存备份文件失败');
    });
  });
});
