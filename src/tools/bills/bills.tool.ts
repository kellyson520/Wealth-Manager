import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../core/database/database';
import { BillRecord, ToolResult } from '../../shared/types';

export async function add_bill(params: {
  amount: number;
  type: 'income' | 'expense';
  merchant?: string;
  category?: string;
  note?: string;
  date?: string;
}): Promise<ToolResult> {
  if (!params.amount || params.amount <= 0) {
    return { success: false, error: '金额不正确', errorCode: '1002' };
  }

  const db = await getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();
  const date = params.date || now.split('T')[0];

  try {
    await db.runAsync(
      `INSERT INTO bills (id, amount, type, category, tags, merchant, raw_description, date, note, source, created_at)
       VALUES (?, ?, ?, ?, '[]', ?, ?, ?, ?, 'manual', ?)`,
      [
        id,
        params.amount,
        params.type,
        params.category || '其他',
        params.merchant || '',
        params.merchant || params.note || '',
        date,
        params.note || '',
        now,
      ]
    );

    const bill = await db.getFirstAsync<BillRecord>(
      'SELECT * FROM bills WHERE id = ?',
      [id]
    );

    return { success: true, data: bill };
  } catch (e) {
    return { success: false, error: '记账失败', errorCode: '1000' };
  }
}

export async function search_bills(params: {
  keyword?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  type?: 'income' | 'expense';
  limit?: number;
  offset?: number;
}): Promise<ToolResult> {
  const db = await getDatabase();
  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (params.keyword) {
    conditions.push('(merchant LIKE ? OR raw_description LIKE ? OR note LIKE ?)');
    const kw = `%${params.keyword}%`;
    values.push(kw, kw, kw);
  }
  if (params.startDate) {
    conditions.push('date >= ?');
    values.push(params.startDate);
  }
  if (params.endDate) {
    conditions.push('date <= ?');
    values.push(params.endDate);
  }
  if (params.category) {
    conditions.push('category = ?');
    values.push(params.category);
  }
  if (params.type) {
    conditions.push('type = ?');
    values.push(params.type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = params.limit || 50;
  const offset = params.offset || 0;

  try {
    const bills = await db.getAllAsync<BillRecord>(
      `SELECT * FROM bills ${where} ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    return { success: true, data: bills };
  } catch (e) {
    return { success: false, error: '查询失败', errorCode: '1000' };
  }
}
