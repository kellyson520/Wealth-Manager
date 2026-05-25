import { getDatabase } from '../../core/database/database';
import { v4 as uuidv4 } from 'uuid';
import { captureError } from '../../core/logger/logger';
import type { ToolResult } from '../../shared/types';

export interface AssetRecord {
  id: string;
  name: string;
  type: '现金' | '银行账户' | '股票' | '基金' | '房产' | '车辆' | '债权' | '其他';
  amount: number;
  currency: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export async function add_asset(params: {
  name: string;
  type?: string;
  amount: number;
  currency?: string;
  note?: string;
}): Promise<ToolResult> {
  try {
    if (!params.name || params.name.trim().length === 0) {
      return { success: false, error: '资产名称不能为空' };
    }
    if (params.amount < 0) {
      return { success: false, error: '资产金额不能为负' };
    }

    const db = await getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO assets (id, name, type, amount, currency, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, params.name, params.type || '其他', params.amount, params.currency || 'CNY', params.note || '', now, now]
    );

    const record: AssetRecord = {
      id,
      name: params.name,
      type: (params.type as AssetRecord['type']) || '其他',
      amount: params.amount,
      currency: params.currency || 'CNY',
      note: params.note || '',
      createdAt: now,
      updatedAt: now,
    };

    return { success: true, data: record };
  } catch (e) {
    captureError('add_asset', e, 'Failed to add asset');
    return { success: false, error: '添加资产时发生异常' };
  }
}

export async function list_assets(params?: {
  type?: string;
  keyword?: string;
  limit?: number;
}): Promise<ToolResult> {
  try {
    const db = await getDatabase();
    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (params?.type) {
      conditions.push('type = ?');
      values.push(params.type);
    }
    if (params?.keyword) {
      conditions.push('(name LIKE ? OR note LIKE ?)');
      const kw = `%${params.keyword}%`;
      values.push(kw, kw);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = params?.limit || 50;

    const rows = await db.getAllAsync<{
      id: string; name: string; type: string; amount: number;
      currency: string; note: string; created_at: string; updated_at: string;
    }>(
      `SELECT * FROM assets ${where} ORDER BY amount DESC LIMIT ?`,
      [...values, limit]
    );

    const assets: AssetRecord[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type as AssetRecord['type'],
      amount: row.amount,
      currency: row.currency,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { success: true, data: assets };
  } catch (e) {
    captureError('list_assets', e, 'Failed to list assets');
    return { success: false, error: '查询资产时发生异常' };
  }
}

export async function update_asset_value(params: {
  assetId: string;
  amount: number;
  note?: string;
}): Promise<ToolResult> {
  try {
    if (!params.assetId) {
      return { success: false, error: '资产ID不能为空' };
    }

    const db = await getDatabase();
    const now = new Date().toISOString();

    await db.runAsync(
      'UPDATE assets SET amount = ?, note = ?, updated_at = ? WHERE id = ?',
      [params.amount, params.note || '', now, params.assetId]
    );

    return { success: true, data: { id: params.assetId, amount: params.amount, updatedAt: now } };
  } catch (e) {
    captureError('update_asset_value', e, 'Failed to update asset');
    return { success: false, error: '更新资产时发生异常' };
  }
}

export async function get_asset_summary(): Promise<ToolResult> {
  try {
    const db = await getDatabase();
    const result = await db.getAllAsync<{ type: string; total: number; count: number }>(
      `SELECT type, SUM(amount) as total, COUNT(*) as count FROM assets GROUP BY type ORDER BY total DESC`
    );

    const grandTotal = await db.getFirstAsync<{ total: number }>(
      'SELECT SUM(amount) as total FROM assets'
    );

    return {
      success: true,
      data: {
        breakdown: result.map((r) => ({ type: r.type, total: r.total, count: r.count })),
        totalAssets: grandTotal?.total || 0,
      },
    };
  } catch (e) {
    captureError('get_asset_summary', e, 'Failed to get asset summary');
    return { success: false, error: '获取资产汇总时发生异常' };
  }
}

export async function delete_asset(params: { assetId: string }): Promise<ToolResult> {
  try {
    if (!params.assetId) {
      return { success: false, error: '资产ID不能为空' };
    }

    const db = await getDatabase();
    await db.runAsync('DELETE FROM assets WHERE id = ?', [params.assetId]);

    return { success: true, data: { id: params.assetId, deleted: true } };
  } catch (e) {
    captureError('delete_asset', e, 'Failed to delete asset');
    return { success: false, error: '删除资产时发生异常' };
  }
}
