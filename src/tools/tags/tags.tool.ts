import { getDatabase } from '../../core/database/database';
import { v4 as uuidv4 } from 'uuid';
import { captureError } from '../../core/logger/logger';
import type { ToolResult } from '../../shared/types';

export interface TagRecord {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export async function add_tag(params: {
  name: string;
  color?: string;
}): Promise<ToolResult> {
  try {
    if (!params.name || params.name.trim().length === 0) {
      return { success: false, error: '标签名称不能为空' };
    }

    const db = await getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();

    await db.runAsync(
      'INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)',
      [id, params.name, params.color || '#4A90D9', now]
    );

    const record: TagRecord = {
      id,
      name: params.name,
      color: params.color || '#4A90D9',
      createdAt: now,
    };

    return { success: true, data: record };
  } catch (e) {
    captureError('add_tag', e, 'Failed to add tag');
    return { success: false, error: '添加标签时发生异常' };
  }
}

export async function list_tags(params?: {
  keyword?: string;
  limit?: number;
}): Promise<ToolResult> {
  try {
    const db = await getDatabase();
    const values: (string | number)[] = [];
    let where = '';

    if (params?.keyword) {
      where = 'WHERE name LIKE ?';
      values.push(`%${params.keyword}%`);
    }

    const limit = params?.limit || 50;
    values.push(limit);

    const rows = await db.getAllAsync<{
      id: string; name: string; color: string; created_at: string;
    }>(
      `SELECT t.*, COUNT(bt.bill_id) as bill_count
       FROM tags t
       LEFT JOIN bill_tags bt ON t.id = bt.tag_id
       ${where}
       GROUP BY t.id
       ORDER BY t.created_at DESC
       LIMIT ?`,
      values
    );

    const tags = rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      billCount: row.bill_count || 0,
      createdAt: row.created_at,
    }));

    return { success: true, data: tags };
  } catch (e) {
    captureError('list_tags', e, 'Failed to list tags');
    return { success: false, error: '查询标签时发生异常' };
  }
}

export async function tag_bill(params: {
  billId: string;
  tagId: string;
}): Promise<ToolResult> {
  try {
    if (!params.billId || !params.tagId) {
      return { success: false, error: '账单ID和标签ID不能为空' };
    }

    const db = await getDatabase();

    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT bill_id as id FROM bill_tags WHERE bill_id = ? AND tag_id = ?',
      [params.billId, params.tagId]
    );

    if (existing) {
      return { success: true, data: { alreadyTagged: true } };
    }

    await db.runAsync(
      'INSERT INTO bill_tags (bill_id, tag_id) VALUES (?, ?)',
      [params.billId, params.tagId]
    );

    return { success: true, data: { billId: params.billId, tagId: params.tagId, tagged: true } };
  } catch (e) {
    captureError('tag_bill', e, 'Failed to tag bill');
    return { success: false, error: '添加标签关联时发生异常' };
  }
}

export async function untag_bill(params: {
  billId: string;
  tagId: string;
}): Promise<ToolResult> {
  try {
    if (!params.billId || !params.tagId) {
      return { success: false, error: '账单ID和标签ID不能为空' };
    }

    const db = await getDatabase();
    await db.runAsync(
      'DELETE FROM bill_tags WHERE bill_id = ? AND tag_id = ?',
      [params.billId, params.tagId]
    );

    return { success: true, data: { billId: params.billId, tagId: params.tagId, untagged: true } };
  } catch (e) {
    captureError('untag_bill', e, 'Failed to untag bill');
    return { success: false, error: '移除标签关联时发生异常' };
  }
}
