import { getDatabase } from '../../core/database/database';
import { v4 as uuidv4 } from 'uuid';
import { captureError } from '../../core/logger/logger';
import type { ToolResult } from '../../shared/types';

interface SharedLink {
  id: string;
  bills: { id: string; merchant: string; amount: number; date: string; category: string }[];
  createdAt: string;
  expiresAt?: string;
  token: string;
}

const linkStore = new Map<string, SharedLink>();

function generateToken(): string {
  return uuidv4().replace(/-/g, '').slice(0, 12);
}

export async function create_link(params: {
  billIds?: string[];
  startDate?: string;
  endDate?: string;
  expiresInHours?: number;
}): Promise<ToolResult> {
  try {
    const db = await getDatabase();
    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (params.billIds && params.billIds.length > 0) {
      conditions.push(`id IN (${params.billIds.map(() => '?').join(',')})`);
      values.push(...params.billIds);
    }
    if (params.startDate) { conditions.push('date >= ?'); values.push(params.startDate); }
    if (params.endDate) { conditions.push('date <= ?'); values.push(params.endDate); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await db.getAllAsync<{
      id: string; merchant: string; amount: number; date: string; category: string; type: string;
    }>(
      `SELECT id, merchant, amount, date, category, type FROM bills ${where} ORDER BY date DESC LIMIT 200`,
      values
    );

    if (rows.length === 0) {
      return { success: false, error: '没有可分享的账单' };
    }

    const id = uuidv4();
    const token = generateToken();
    const now = new Date().toISOString();
    const expiresAt = params.expiresInHours
      ? new Date(Date.now() + params.expiresInHours * 3600000).toISOString()
      : undefined;

    const link: SharedLink = {
      id,
      bills: rows.map((r) => ({
        id: r.id, merchant: r.merchant, amount: r.amount, date: r.date, category: r.category,
      })),
      createdAt: now,
      expiresAt,
      token,
    };

    linkStore.set(id, link);

    const summary = {
      totalExpense: rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0),
      totalIncome: rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0),
      billCount: rows.length,
    };

    return {
      success: true,
      data: {
        linkId: id,
        token,
        expiresAt,
        summary,
        bills: link.bills.slice(0, 10),
      },
    };
  } catch (e) {
    captureError('create_link', e, 'Failed to create share link');
    return { success: false, error: '创建分享链接失败' };
  }
}

export async function leave_shared(params: {
  token: string;
}): Promise<ToolResult> {
  try {
    if (!params.token) return { success: false, error: '分享令牌不能为空' };

    for (const [id, link] of linkStore) {
      if (link.token === params.token) {
        if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
          linkStore.delete(id);
          return { success: false, error: '分享链接已过期' };
        }
        return {
          success: true,
          data: { linkId: id, bills: link.bills, createdAt: link.createdAt },
        };
      }
    }

    return { success: false, error: '无效的分享令牌' };
  } catch (e) {
    captureError('leave_shared', e, 'Failed to access shared link');
    return { success: false, error: '访问分享链接失败' };
  }
}

export async function delete_link(params: {
  linkId: string;
}): Promise<ToolResult> {
  try {
    if (!params.linkId) return { success: false, error: '链接ID不能为空' };

    const existed = linkStore.has(params.linkId);
    linkStore.delete(params.linkId);

    if (!existed) return { success: false, error: '分享链接不存在' };

    return { success: true, data: { linkId: params.linkId, deleted: true } };
  } catch (e) {
    captureError('delete_link', e, 'Failed to delete share link');
    return { success: false, error: '删除分享链接失败' };
  }
}
