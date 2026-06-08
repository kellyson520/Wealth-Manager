import { getDatabase } from '../../core/database/database';
import { v4 as uuidv4 } from 'uuid';
import { captureError } from '../../core/logger/logger';
import type { ToolResult } from '../../shared/types';

export interface DebtRecord {
  id: string;
  title: string;
  type: '借出' | '借入';
  principal: number;
  remaining: number;
  counterparty: string;
  interestRate: number;
  startDate: string;
  dueDate?: string;
  status: 'active' | 'cleared' | 'overdue';
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface RepaymentRecord {
  id: string;
  debtId: string;
  amount: number;
  date: string;
  note: string;
  createdAt: string;
}

export async function add_debt(params: {
  title: string;
  type: '借出' | '借入';
  principal: number;
  counterparty: string;
  interestRate?: number;
  startDate?: string;
  dueDate?: string;
  note?: string;
}): Promise<ToolResult> {
  try {
    if (!params.title || params.title.trim().length === 0) {
      return { success: false, error: '债务标题不能为空' };
    }
    if (!params.counterparty) {
      return { success: false, error: '交易对方不能为空' };
    }
    if (!params.principal || params.principal <= 0) {
      return { success: false, error: '本金必须大于0' };
    }

    const db = await getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();
    const startDate = params.startDate || now.split('T')[0];

    await db.runAsync(
      `INSERT INTO debts (id, title, type, principal, remaining, counterparty, interest_rate, start_date, due_date, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, params.title, params.type, params.principal, params.principal,
        params.counterparty, params.interestRate || 0, startDate,
        params.dueDate || null, params.note || '', now, now,
      ]
    );

    const record: DebtRecord = {
      id, title: params.title, type: params.type,
      principal: params.principal, remaining: params.principal,
      counterparty: params.counterparty, interestRate: params.interestRate || 0,
      startDate, dueDate: params.dueDate,
      status: 'active', note: params.note || '',
      createdAt: now, updatedAt: now,
    };

    return { success: true, data: record };
  } catch (e) {
    captureError('add_debt', e, 'Failed to add debt');
    return { success: false, error: '添加债务时发生异常' };
  }
}

export async function list_debts(params?: {
  type?: '借出' | '借入';
  status?: 'active' | 'cleared' | 'overdue';
  counterparty?: string;
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
    if (params?.status) {
      conditions.push('status = ?');
      values.push(params.status);
    }
    if (params?.counterparty) {
      conditions.push('counterparty LIKE ?');
      values.push(`%${params.counterparty}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = params?.limit || 50;

    const rows = await db.getAllAsync<{
      id: string; title: string; type: string; principal: number; remaining: number;
      counterparty: string; interest_rate: number; start_date: string; due_date: string | null;
      status: string; note: string; created_at: string; updated_at: string;
    }>(
      `SELECT * FROM debts ${where} ORDER BY status ASC, created_at DESC LIMIT ?`,
      [...values, limit]
    );

    const debts: DebtRecord[] = rows.map((row) => ({
      id: row.id, title: row.title, type: row.type as DebtRecord['type'],
      principal: row.principal, remaining: row.remaining,
      counterparty: row.counterparty, interestRate: row.interest_rate,
      startDate: row.start_date, dueDate: row.due_date || undefined,
      status: row.status as DebtRecord['status'], note: row.note,
      createdAt: row.created_at, updatedAt: row.updated_at,
    }));

    return { success: true, data: debts };
  } catch (e) {
    captureError('list_debts', e, 'Failed to list debts');
    return { success: false, error: '查询债务时发生异常' };
  }
}

export async function record_repayment(params: {
  debtId: string;
  amount: number;
  date?: string;
  note?: string;
}): Promise<ToolResult> {
  try {
    if (!params.debtId) {
      return { success: false, error: '债务ID不能为空' };
    }
    if (!params.amount || params.amount <= 0) {
      return { success: false, error: '还款金额必须大于0' };
    }

    const db = await getDatabase();
    const now = new Date().toISOString();
    const date = params.date || now.split('T')[0];
    const repaymentId = uuidv4();

    const debt = await db.getFirstAsync<{ remaining: number; principal: number }>(
      'SELECT remaining, principal FROM debts WHERE id = ?', [params.debtId]
    );

    if (!debt) {
      return { success: false, error: '未找到该债务记录' };
    }
    if (params.amount > debt.remaining) {
      return { success: false, error: '还款金额不能超过剩余金额' };
    }

    const newRemaining = debt.remaining - params.amount;

    const newStatus = newRemaining === 0 ? 'cleared' : 'active';
    try {
      await db.execAsync('BEGIN IMMEDIATE TRANSACTION');
      await db.runAsync(
        'INSERT INTO repayments (id, debt_id, amount, date, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [repaymentId, params.debtId, params.amount, date, params.note || '', now]
      );

      await db.runAsync(
        'UPDATE debts SET remaining = ?, status = ?, updated_at = ? WHERE id = ?',
        [newRemaining, newStatus, now, params.debtId]
      );
      await db.execAsync('COMMIT');
    } catch (e) {
      await db.execAsync('ROLLBACK').catch(() => undefined);
      throw e;
    }

    return {
      success: true,
      data: {
        repaymentId,
        debtId: params.debtId,
        amount: params.amount,
        newRemaining,
        status: newStatus,
      },
    };
  } catch (e) {
    captureError('record_repayment', e, 'Failed to record repayment');
    return { success: false, error: '记录还款时发生异常' };
  }
}

export async function get_debt_summary(): Promise<ToolResult> {
  try {
    const db = await getDatabase();

    const summary = await db.getFirstAsync<{
      total_lent: number; total_borrowed: number;
      active_lent: number; active_borrowed: number;
      overdue_count: number;
    }>(
      `SELECT
        COALESCE(SUM(CASE WHEN type = '借出' THEN principal ELSE 0 END), 0) as total_lent,
        COALESCE(SUM(CASE WHEN type = '借入' THEN principal ELSE 0 END), 0) as total_borrowed,
        COALESCE(SUM(CASE WHEN type = '借出' THEN remaining ELSE 0 END), 0) as active_lent,
        COALESCE(SUM(CASE WHEN type = '借入' THEN remaining ELSE 0 END), 0) as active_borrowed,
        COALESCE(SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END), 0) as overdue_count
       FROM debts`
    );

    return {
      success: true,
      data: {
        totalLent: summary?.total_lent || 0,
        totalBorrowed: summary?.total_borrowed || 0,
        activeLent: summary?.active_lent || 0,
        activeBorrowed: summary?.active_borrowed || 0,
        netPosition: (summary?.active_lent || 0) - (summary?.active_borrowed || 0),
        overdueCount: summary?.overdue_count || 0,
      },
    };
  } catch (e) {
    captureError('get_debt_summary', e, 'Failed to get debt summary');
    return { success: false, error: '获取债务汇总时发生异常' };
  }
}

export async function add_credit_card(params: {
  name: string;
  bank: string;
  creditLimit: number;
  billDay?: number;
  paymentDay?: number;
  note?: string;
}): Promise<ToolResult> {
  try {
    if (!params.name || !params.bank) {
      return { success: false, error: '信用卡名称和发卡行不能为空' };
    }
    if (!params.creditLimit || params.creditLimit <= 0) {
      return { success: false, error: '额度必须大于0' };
    }

    const db = await getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO assets (id, name, type, amount, currency, note, created_at, updated_at)
       VALUES (?, ?, '信用卡', ?, 'CNY', ?, ?, ?)`,
      [
        id,
        `${params.name}(${params.bank})`,
        -params.creditLimit,
        JSON.stringify({
          bank: params.bank,
          creditLimit: params.creditLimit,
          billDay: params.billDay || 1,
          paymentDay: params.paymentDay || 25,
          cardType: 'credit_card',
          note: params.note || '',
        }),
        now, now,
      ]
    );

    return {
      success: true,
      data: {
        id,
        name: params.name,
        bank: params.bank,
        creditLimit: params.creditLimit,
        billDay: params.billDay || 1,
        paymentDay: params.paymentDay || 25,
      },
    };
  } catch (e) {
    captureError('add_credit_card', e, 'Failed to add credit card');
    return { success: false, error: '添加信用卡时发生异常' };
  }
}
