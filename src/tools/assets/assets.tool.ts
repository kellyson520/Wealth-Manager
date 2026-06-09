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

const ASSET_TYPES: AssetRecord['type'][] = ['现金', '银行账户', '股票', '基金', '房产', '车辆', '债权', '其他'];

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
    if (!Number.isFinite(params.amount) || params.amount < 0) {
      return { success: false, error: '资产金额必须为非负数' };
    }
    if (params.type && !ASSET_TYPES.includes(params.type as AssetRecord['type'])) {
      return { success: false, error: '资产类型无效' };
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
    const limit = params?.limit ?? 50;
    if (!Number.isInteger(limit) || limit <= 0) {
      return { success: false, error: '查询数量必须为正整数' };
    }

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
    if (!Number.isFinite(params.amount) || params.amount < 0) {
      return { success: false, error: '资产金额必须为非负数' };
    }

    const db = await getDatabase();
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM assets WHERE id = ?', [params.assetId]
    );
    if (!existing) return { success: false, error: '资产不存在' };

    const now = new Date().toISOString();

    const updates = ['amount = ?', 'updated_at = ?'];
    const values: (string | number)[] = [params.amount, now];
    if (params.note !== undefined) {
      updates.push('note = ?');
      values.push(params.note);
    }
    values.push(params.assetId);

    await db.runAsync(
      `UPDATE assets SET ${updates.join(', ')} WHERE id = ?`,
      values
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
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM assets WHERE id = ?', [params.assetId]
    );
    if (!existing) return { success: false, error: '资产不存在' };

    await db.runAsync('DELETE FROM assets WHERE id = ?', [params.assetId]);

    return { success: true, data: { id: params.assetId, deleted: true } };
  } catch (e) {
    captureError('delete_asset', e, 'Failed to delete asset');
    return { success: false, error: '删除资产时发生异常' };
  }
}

export async function transfer_asset(params: {
  fromAssetId: string;
  toAssetId: string;
  amount: number;
  note?: string;
}): Promise<ToolResult> {
  try {
    if (!params.fromAssetId || !params.toAssetId) {
      return { success: false, error: '转出和转入资产ID不能为空' };
    }
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      return { success: false, error: '转账金额必须为大于0的有限数字' };
    }
    if (params.fromAssetId === params.toAssetId) {
      return { success: false, error: '不能向同一资产转账' };
    }

    const db = await getDatabase();
    const now = new Date().toISOString();
    let fromAsset: { id: string; amount: number; name: string; type: string } | null = null;
    let toAsset: { id: string; amount: number; name: string } | null = null;

    try {
      await db.execAsync('BEGIN IMMEDIATE TRANSACTION');

      fromAsset = await db.getFirstAsync<{ id: string; amount: number; name: string; type: string }>(
        'SELECT * FROM assets WHERE id = ?', [params.fromAssetId]
      );
      if (!fromAsset) {
        await db.execAsync('ROLLBACK');
        return { success: false, error: '转出资产不存在' };
      }

      toAsset = await db.getFirstAsync<{ id: string; amount: number; name: string }>(
        'SELECT * FROM assets WHERE id = ?', [params.toAssetId]
      );
      if (!toAsset) {
        await db.execAsync('ROLLBACK');
        return { success: false, error: '转入资产不存在' };
      }

      const debit = await db.runAsync(
        'UPDATE assets SET amount = amount - ?, updated_at = ? WHERE id = ? AND amount >= ?',
        [params.amount, now, params.fromAssetId, params.amount]
      );
      if (debit.changes !== 1) {
        await db.execAsync('ROLLBACK');
        return { success: false, error: `${fromAsset.name} 余额不足 (当前: ${fromAsset.amount}, 需转: ${params.amount})` };
      }

      await db.runAsync(
        'UPDATE assets SET amount = amount + ?, updated_at = ? WHERE id = ?',
        [params.amount, now, params.toAssetId]
      );
      await db.execAsync('COMMIT');
    } catch (e) {
      await db.execAsync('ROLLBACK').catch(() => undefined);
      throw e;
    }

    const committedFrom = await db.getFirstAsync<{ amount: number }>(
      'SELECT amount FROM assets WHERE id = ?', [params.fromAssetId]
    );
    const committedTo = await db.getFirstAsync<{ amount: number }>(
      'SELECT amount FROM assets WHERE id = ?', [params.toAssetId]
    );

    return {
      success: true,
      data: {
        from: { id: params.fromAssetId, name: fromAsset.name, newAmount: committedFrom?.amount ?? fromAsset.amount - params.amount },
        to: { id: params.toAssetId, name: toAsset.name, newAmount: committedTo?.amount ?? toAsset.amount + params.amount },
        amount: params.amount,
      },
    };
  } catch (e) {
    captureError('transfer_asset', e, 'Failed to transfer asset');
    return { success: false, error: '转账时发生异常' };
  }
}
