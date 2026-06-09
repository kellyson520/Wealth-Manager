import { getDatabase } from '../../core/database/database';
import { v4 as uuidv4 } from 'uuid';
import { captureError } from '../../core/logger/logger';
import type { ToolResult } from '../../shared/types';

export interface ReimbursementRecord {
  id: string;
  title: string;
  amount: number;
  category: string;
  status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'paid';
  merchant: string;
  date: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export async function create_reimbursement(params: {
  title: string;
  amount: number;
  category?: string;
  merchant?: string;
  date?: string;
  note?: string;
}): Promise<ToolResult> {
  try {
    if (!params.title || params.title.trim().length === 0) {
      return { success: false, error: '报销标题不能为空' };
    }
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      return { success: false, error: '报销金额必须大于0' };
    }

    const db = await getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();
    const date = params.date || now.split('T')[0];

    await db.runAsync(
      `INSERT INTO reimbursement_tasks (id, title, amount, category, merchant, date, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, params.title, params.amount, params.category || '其他', params.merchant || '', date, params.note || '', now, now]
    );

    const record: ReimbursementRecord = {
      id, title: params.title, amount: params.amount,
      category: params.category || '其他', status: 'pending',
      merchant: params.merchant || '', date, note: params.note || '',
      createdAt: now, updatedAt: now,
    };

    return { success: true, data: record };
  } catch (e) {
    captureError('create_reimbursement', e, 'Failed to create reimbursement');
    return { success: false, error: '创建报销时发生异常' };
  }
}

export async function update_reimbursement_status(params: {
  taskId: string;
  status: 'submitted' | 'approved' | 'rejected' | 'paid';
}): Promise<ToolResult> {
  try {
    if (!params.taskId) {
      return { success: false, error: '报销ID不能为空' };
    }
    if (!['submitted', 'approved', 'rejected', 'paid'].includes(params.status)) {
      return { success: false, error: '无效的状态值' };
    }

    const db = await getDatabase();
    const now = new Date().toISOString();

    const result = await db.runAsync(
      'UPDATE reimbursement_tasks SET status = ?, updated_at = ? WHERE id = ?',
      [params.status, now, params.taskId]
    );

    if (result.changes !== 1) {
      return { success: false, error: '报销任务不存在' };
    }

    return { success: true, data: { taskId: params.taskId, status: params.status, updatedAt: now } };
  } catch (e) {
    captureError('update_reimbursement_status', e, 'Failed to update reimbursement status');
    return { success: false, error: '更新报销状态时发生异常' };
  }
}

export async function list_reimbursements(params?: {
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<ToolResult> {
  try {
    const db = await getDatabase();
    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (params?.status) {
      conditions.push('status = ?');
      values.push(params.status);
    }
    if (params?.startDate) {
      conditions.push('date >= ?');
      values.push(params.startDate);
    }
    if (params?.endDate) {
      conditions.push('date <= ?');
      values.push(params.endDate);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = params?.limit || 50;

    const rows = await db.getAllAsync<{
      id: string; title: string; amount: number; category: string; status: string;
      merchant: string; date: string; note: string; created_at: string; updated_at: string;
    }>(
      `SELECT * FROM reimbursement_tasks ${where} ORDER BY created_at DESC LIMIT ?`,
      [...values, limit]
    );

    const tasks: ReimbursementRecord[] = rows.map((row) => ({
      id: row.id, title: row.title, amount: row.amount,
      category: row.category, status: row.status as ReimbursementRecord['status'],
      merchant: row.merchant, date: row.date, note: row.note,
      createdAt: row.created_at, updatedAt: row.updated_at,
    }));

    const summary = await db.getFirstAsync<{
      pending_total: number; approved_total: number; count: number;
    }>(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_total,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as approved_total,
        COUNT(*) as count
       FROM reimbursement_tasks`
    );

    return {
      success: true,
      data: {
        tasks,
        summary: summary ? {
          pendingTotal: summary.pending_total,
          approvedTotal: summary.approved_total,
          totalCount: summary.count,
        } : { pendingTotal: 0, approvedTotal: 0, totalCount: 0 },
      },
    };
  } catch (e) {
    captureError('list_reimbursements', e, 'Failed to list reimbursements');
    return { success: false, error: '查询报销时发生异常' };
  }
}

export async function settle_reimbursement(params: {
  taskId: string;
}): Promise<ToolResult> {
  try {
    if (!params.taskId) return { success: false, error: '报销ID不能为空' };

    const db = await getDatabase();
    const task = await db.getFirstAsync<{ id: string; amount: number; status: string; title: string }>(
      'SELECT * FROM reimbursement_tasks WHERE id = ?', [params.taskId]
    );

    if (!task) return { success: false, error: '报销任务不存在' };
    if (task.status !== 'approved') {
      return { success: false, error: '只能结算已审批的报销（当前状态: ' + task.status + '）' };
    }

    const now = new Date().toISOString();
    await db.runAsync(
      'UPDATE reimbursement_tasks SET status = ?, updated_at = ? WHERE id = ?',
      ['paid', now, params.taskId]
    );

    return {
      success: true,
      data: {
        taskId: params.taskId,
        title: task.title,
        amount: task.amount,
        status: 'paid',
        settledAt: now,
      },
    };
  } catch (e) {
    captureError('settle_reimbursement', e, 'Failed to settle reimbursement');
    return { success: false, error: '结算报销时发生异常' };
  }
}
