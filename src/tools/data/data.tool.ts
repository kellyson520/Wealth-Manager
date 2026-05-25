import { getDatabase } from '../../core/database/database';
import { v4 as uuidv4 } from 'uuid';
import { captureError } from '../../core/logger/logger';
import type { ToolResult } from '../../shared/types';

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
      date: string; type: string; category: string; merchant: string;
      amount: number; note: string; tags: string;
    }>(
      `SELECT date, type, category, merchant, amount, note, tags FROM bills ${where} ORDER BY date DESC LIMIT 1000`
    );

    let csv = '日期,类型,分类,商户,金额,备注,标签\n';
    for (const row of rows) {
      const typeLabel = row.type === 'income' ? '收入' : row.type === 'refund' ? '退款' : '支出';
      csv += `${row.date},${typeLabel},${row.category},${escapeCSV(row.merchant)},${row.amount.toFixed(2)},${escapeCSV(row.note)},${escapeCSV(row.tags)}\n`;
    }

    const now = new Date();
    const filename = `wealth_manager_export_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}.csv`;
    const filePath = await saveFile(filename, csv);

    return {
      success: true,
      data: { filename, filePath, rowCount: rows.length, csvContent: csv },
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
    const bills = await db.getAllAsync(
      `SELECT * FROM bills ${where} ORDER BY date DESC LIMIT 1000`
    );

    const now = new Date();
    const filename = `wealth_manager_export_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}.json`;
    const exportData = { exportedAt: now.toISOString(), appVersion: '0.1.0', billCount: bills.length, bills };
    const jsonContent = JSON.stringify(exportData, null, 2);
    const filePath = await saveFile(filename, jsonContent);

    return {
      success: true,
      data: { filename, filePath, billCount: bills.length, jsonContent },
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

    const tables = ['bills', 'debts', 'repayments', 'assets', 'tags', 'bill_tags', 'budget_limits', 'savings_goals', 'achievements', 'classification_rules', 'recurring_tasks', 'reimbursement_tasks'];
    const backup: Record<string, unknown> = {
      _metadata: { backupId, createdAt: now, version: '0.1.0' },
    };

    for (const table of tables) {
      try {
        const rows = await db.getAllAsync(`SELECT * FROM ${table} LIMIT 5000`);
        backup[table] = rows;
      } catch {
        backup[table] = [];
      }
    }

    const jsonContent = JSON.stringify(backup);
    const filePath = await saveFile(filename, jsonContent);

    return {
      success: true,
      data: { backupId, filename, filePath, tableCount: Object.keys(backup).length - 1, backupContent: jsonContent },
    };
  } catch (e) {
    captureError('create_backup', e, 'Failed to create backup');
    return { success: false, error: '创建备份时发生异常' };
  }
}

function escapeCSV(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
