import { getDatabase } from '../../core/database/database';
import { v4 as uuidv4 } from 'uuid';
import { captureError } from '../../core/logger/logger';
import type { ToolResult } from '../../shared/types';

type ExportRow = Record<string, unknown>;

const SAFE_BILL_EXPORT_FIELDS = ['date', 'type', 'category', 'amount'];

const SAFE_BACKUP_FIELDS: Record<string, string[]> = {
  bills: SAFE_BILL_EXPORT_FIELDS,
  debts: ['type', 'principal', 'remaining', 'interest_rate', 'start_date', 'due_date', 'status', 'created_at', 'updated_at'],
  repayments: ['amount', 'date', 'created_at'],
  assets: ['type', 'amount', 'currency', 'created_at', 'updated_at'],
  tags: ['color', 'created_at'],
  bill_tags: [],
  budget_limits: ['category', 'limit', 'period'],
  savings_goals: ['target_amount', 'current_amount', 'deadline', 'created_at'],
  achievements: ['name', 'description', 'unlocked', 'progress', 'max_progress', 'unlocked_at'],
  classification_rules: ['priority', 'enabled', 'hit_count', 'last_hit_at', 'created_at', 'updated_at'],
  recurring_tasks: ['type', 'cron', 'enabled', 'last_triggered', 'created_at'],
  reimbursement_tasks: ['amount', 'category', 'status', 'date', 'created_at', 'updated_at'],
};

async function saveFile(filename: string, content: string): Promise<string | null> {
  try {
    const FileSystem = require('expo-file-system');
    const filePath = `${FileSystem.documentDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(filePath, content, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return filePath;
  } catch {
    return null;
  }
}

export async function export_csv(params?: {
  startDate?: string;
  endDate?: string;
  category?: string;
}): Promise<ToolResult> {
  try {
    const db = await getDatabase();
    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (params?.startDate) { conditions.push('date >= ?'); values.push(params.startDate); }
    if (params?.endDate) { conditions.push('date <= ?'); values.push(params.endDate); }
    if (params?.category) { conditions.push('category = ?'); values.push(params.category); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await db.getAllAsync<{
      date: string; type: string; category: string; amount: number;
    }>(
      `SELECT date, type, category, amount FROM bills ${where} ORDER BY date DESC LIMIT 1000`,
      values
    );

    let csv = '日期,类型,分类,金额\n';
    for (const row of rows) {
      const typeLabel = row.type === 'income' ? '收入' : row.type === 'refund' ? '退款' : '支出';
      csv += `${escapeCSV(row.date)},${typeLabel},${escapeCSV(row.category)},${Number(row.amount).toFixed(2)}\n`;
    }

    const now = new Date();
    const filename = `wealth_manager_export_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}.csv`;
    const filePath = await saveFile(filename, csv);
    if (!filePath) {
      return { success: false, error: '保存CSV文件失败' };
    }

    return {
      success: true,
      data: { filename, filePath, rowCount: rows.length },
    };
  } catch (e) {
    captureError('export_csv', e, 'Failed to export CSV');
    return { success: false, error: '导出CSV时发生异常' };
  }
}

export async function export_json(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<ToolResult> {
  try {
    const db = await getDatabase();
    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (params?.startDate) { conditions.push('date >= ?'); values.push(params.startDate); }
    if (params?.endDate) { conditions.push('date <= ?'); values.push(params.endDate); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const bills = await db.getAllAsync<ExportRow>(
      `SELECT date, type, category, amount FROM bills ${where} ORDER BY date DESC LIMIT 1000`,
      values
    );
    const sanitizedBills = bills.map((bill) => sanitizeRow('bills', bill));

    const now = new Date();
    const filename = `wealth_manager_export_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}.json`;
    const exportData = { exportedAt: now.toISOString(), appVersion: '0.1.0', billCount: sanitizedBills.length, bills: sanitizedBills };
    const jsonContent = JSON.stringify(exportData, null, 2);
    const filePath = await saveFile(filename, jsonContent);
    if (!filePath) {
      return { success: false, error: '保存JSON文件失败' };
    }

    return {
      success: true,
      data: { filename, filePath, billCount: sanitizedBills.length },
    };
  } catch (e) {
    captureError('export_json', e, 'Failed to export JSON');
    return { success: false, error: '导出JSON时发生异常' };
  }
}

export async function create_backup(): Promise<ToolResult> {
  try {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const backupId = uuidv4();
    const filename = `wealth_manager_backup_${now.replace(/[:.]/g, '-')}.json`;

    const VALID_TABLES = new Set(['bills', 'debts', 'repayments', 'assets', 'tags', 'bill_tags', 'budget_limits', 'savings_goals', 'achievements', 'classification_rules', 'recurring_tasks', 'reimbursement_tasks']);
    const tables = Array.from(VALID_TABLES);
    const backup: Record<string, unknown> = {
      _metadata: { backupId, createdAt: now, version: '0.1.0', sanitized: true },
    };

    for (const table of tables) {
      if (!VALID_TABLES.has(table)) {
        backup[table] = [];
        continue;
      }
      try {
        const rows = await db.getAllAsync<ExportRow>(`SELECT * FROM ${table} LIMIT 5000`);
        backup[table] = rows.map((row) => sanitizeRow(table, row));
      } catch {
        backup[table] = [];
      }
    }

    const jsonContent = JSON.stringify(backup);
    const filePath = await saveFile(filename, jsonContent);
    if (!filePath) {
      return { success: false, error: '保存备份文件失败' };
    }

    return {
      success: true,
      data: { backupId, filename, filePath, tableCount: Object.keys(backup).length - 1 },
    };
  } catch (e) {
    captureError('create_backup', e, 'Failed to create backup');
    return { success: false, error: '创建备份时发生异常' };
  }
}

function sanitizeRow(table: string, row: ExportRow): ExportRow {
  const safeFields = SAFE_BACKUP_FIELDS[table] || [];
  const sanitized: ExportRow = {};

  for (const field of safeFields) {
    if (Object.prototype.hasOwnProperty.call(row, field)) {
      sanitized[field] = row[field];
    }
  }

  return sanitized;
}

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  // Prevent CSV injection: prefix cells starting with formula characters with single quote
  // This is more reliable than zero-width space which may be stripped by some parsers
  const dangerous = /^[=+\-@\t\r]/;
  let sanitized = String(value);
  if (dangerous.test(sanitized)) {
    sanitized = "'" + sanitized; // single quote prefix — standard CSV injection prevention
  }
  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}
