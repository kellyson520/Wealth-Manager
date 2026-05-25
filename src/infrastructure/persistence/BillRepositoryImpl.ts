import { getDatabase } from '../../core/database/database';
import { captureError } from '../../core/logger/logger';
import { Bill } from '../../domain/billing/aggregates/Bill';
import type { BillRepository } from '../../domain/billing/repositories/BillRepository';
import type {
  BillProps,
  BillSearchCriteria,
  AggregationResultDTO,
} from '../../domain/billing/types';

function getStartDate(period: 'today' | 'week' | 'month'): string {
  const now = new Date();
  switch (period) {
    case 'today':
      return now.toISOString().split('T')[0];
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  }
}

export class BillRepositoryImpl implements BillRepository {
  async save(bill: Bill): Promise<void> {
    try {
      const db = await getDatabase();
      const props = bill.toProps();

      const existing = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM bills WHERE id = ?', [props.id]
      );

      if (existing) {
        await db.runAsync(
          `UPDATE bills SET amount=?, type=?, category=?, merchant=?, date=?, note=?, source=?, tags=?
           WHERE id=?`,
          [props.amount, props.type, props.category, props.merchant,
           props.date, props.note, props.source,
           JSON.stringify(props.tags), props.id]
        );
      } else {
        await db.runAsync(
          `INSERT INTO bills (id, amount, type, category, merchant, date, note, source, tags, raw_description, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [props.id, props.amount, props.type, props.category, props.merchant,
           props.date, props.note, props.source,
           JSON.stringify(props.tags), props.merchant + ' ' + props.note, props.createdAt]
        );
      }
    } catch (e) {
      captureError('BillRepositoryImpl.save', e, 'Failed to save bill');
      throw e;
    }
  }

  async findById(id: string): Promise<Bill | null> {
    try {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{
        id: string; amount: number; type: string; category: string;
        merchant: string; tags: string; date: string; note: string;
        source: string; created_at: string;
      }>('SELECT * FROM bills WHERE id = ?', [id]);

      if (!row) return null;

      return Bill.fromProps({
        id: row.id,
        amount: row.amount,
        type: row.type as BillProps['type'],
        category: row.category,
        merchant: row.merchant,
        date: row.date,
        note: row.note || '',
        source: (row.source || 'manual') as BillProps['source'],
        tags: safeParseArray(row.tags),
        createdAt: row.created_at,
      });
    } catch (e) {
      captureError('BillRepositoryImpl.findById', e, 'Failed to find bill');
      return null;
    }
  }

  async search(criteria: BillSearchCriteria): Promise<Bill[]> {
    try {
      const db = await getDatabase();
      const conditions: string[] = [];
      const values: (string | number)[] = [];

      if (criteria.keyword) {
        conditions.push('(merchant LIKE ? OR note LIKE ? OR category LIKE ?)');
        const kw = `%${criteria.keyword}%`;
        values.push(kw, kw, kw);
      }
      if (criteria.startDate) { conditions.push('date >= ?'); values.push(criteria.startDate); }
      if (criteria.endDate) { conditions.push('date <= ?'); values.push(criteria.endDate); }
      if (criteria.category) { conditions.push('category = ?'); values.push(criteria.category); }
      if (criteria.type) { conditions.push('type = ?'); values.push(criteria.type); }
      if (criteria.tags && criteria.tags.length > 0) {
        conditions.push(`(${criteria.tags.map(() => 'tags LIKE ?').join(' OR ')})`);
        criteria.tags.forEach((t: string) => values.push(`%"${t}"%`));
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = Math.min(criteria.limit || 50, 200);
      const offset = criteria.offset || 0;

      const rows = await db.getAllAsync<{
        id: string; amount: number; type: string; category: string;
        merchant: string; tags: string; date: string; note: string;
        source: string; created_at: string;
      }>(
        `SELECT * FROM bills ${where} ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?`,
        [...values, limit, offset]
      );

      return rows.map((r) => Bill.fromProps({
        id: r.id,
        amount: r.amount,
        type: r.type as BillProps['type'],
        category: r.category,
        merchant: r.merchant,
        date: r.date,
        note: r.note || '',
        source: (r.source || 'manual') as BillProps['source'],
        tags: safeParseArray(r.tags),
        createdAt: r.created_at,
      }));
    } catch (e) {
      captureError('BillRepositoryImpl.search', e, 'Failed to search bills');
      return [];
    }
  }

  async findByDateRange(startDate: string, endDate: string): Promise<Bill[]> {
    return this.search({ startDate, endDate, limit: 500 });
  }

  async aggregate(period: 'today' | 'week' | 'month'): Promise<AggregationResultDTO> {
    try {
      const db = await getDatabase();
      const startDate = getStartDate(period);

      const incomeRow = await db.getFirstAsync<{ total: number }>(
        "SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type='income' AND date >= ?",
        [startDate]
      );
      const expenseRow = await db.getFirstAsync<{ total: number }>(
        "SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type='expense' AND date >= ?",
        [startDate]
      );
      const countRow = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM bills WHERE date >= ?',
        [startDate]
      );
      const catRows = await db.getAllAsync<{ category: string; total: number }>(
        "SELECT category, SUM(amount) as total FROM bills WHERE type='expense' AND date >= ? GROUP BY category ORDER BY total DESC",
        [startDate]
      );

      const byCategory: Record<string, number> = {};
      for (const r of catRows) { byCategory[r.category] = r.total; }

      return {
        totalIncome: incomeRow?.total || 0,
        totalExpense: expenseRow?.total || 0,
        billCount: countRow?.count || 0,
        byCategory,
      };
    } catch (e) {
      captureError('BillRepositoryImpl.aggregate', e, 'Failed to aggregate');
      return { totalIncome: 0, totalExpense: 0, billCount: 0, byCategory: {} };
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM bills WHERE id = ?', [id]);
      return true;
    } catch (e) {
      captureError('BillRepositoryImpl.delete', e, 'Failed to delete bill');
      return false;
    }
  }

  async getCategoryTotals(startDate: string, type: 'income' | 'expense'): Promise<Record<string, number>> {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<{ category: string; total: number }>(
        `SELECT category, SUM(amount) as total FROM bills WHERE type=? AND date >= ? GROUP BY category`,
        [type, startDate]
      );
      const result: Record<string, number> = {};
      for (const r of rows) { result[r.category] = r.total; }
      return result;
    } catch (e) {
      captureError('BillRepositoryImpl.getCategoryTotals', e, 'Failed');
      return {};
    }
  }

  async getMonthlyComparison(months: number): Promise<{ month: string; income: number; expense: number }[]> {
    try {
      const db = await getDatabase();
      const now = new Date();
      const results: { month: string; income: number; expense: number }[] = [];

      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mStart = d.toISOString().split('T')[0];
        const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];

        const inc = await db.getFirstAsync<{ total: number }>(
          "SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type='income' AND date >= ? AND date <= ?",
          [mStart, mEnd]
        );
        const exp = await db.getFirstAsync<{ total: number }>(
          "SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type='expense' AND date >= ? AND date <= ?",
          [mStart, mEnd]
        );

        results.push({
          month: `${d.getMonth() + 1}月`,
          income: inc?.total || 0,
          expense: exp?.total || 0,
        });
      }
      return results;
    } catch (e) {
      captureError('BillRepositoryImpl.getMonthlyComparison', e, 'Failed');
      return [];
    }
  }

  async getMerchantRanking(startDate: string, limit: number): Promise<{ merchant: string; totalAmount: number; count: number }[]> {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<{ merchant: string; total_amount: number; count: number }>(
        `SELECT merchant, SUM(amount) as total_amount, COUNT(*) as count
         FROM bills WHERE type='expense' AND date >= ? AND merchant != ''
         GROUP BY merchant ORDER BY total_amount DESC LIMIT ?`,
        [startDate, Math.min(limit, 50)]
      );
      return rows.map((r) => ({ merchant: r.merchant, totalAmount: r.total_amount, count: r.count }));
    } catch (e) {
      captureError('BillRepositoryImpl.getMerchantRanking', e, 'Failed');
      return [];
    }
  }

  async getDailyExpenses(startDate: string): Promise<{ date: string; total: number }[]> {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<{ date: string; total: number }>(
        "SELECT date, SUM(amount) as total FROM bills WHERE type='expense' AND date >= ? GROUP BY date ORDER BY date",
        [startDate]
      );
      return rows.map((r) => ({ date: r.date, total: r.total }));
    } catch (e) {
      captureError('BillRepositoryImpl.getDailyExpenses', e, 'Failed');
      return [];
    }
  }

  async getDistinctCategories(): Promise<string[]> {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<{ name: string }>(
        'SELECT name FROM categories ORDER BY name'
      );
      return rows.map((r) => r.name);
    } catch (e) {
      captureError('BillRepositoryImpl.getDistinctCategories', e, 'Failed');
      return [];
    }
  }
}

function safeParseArray(str: string): string[] {
  try { return JSON.parse(str); } catch { return []; }
}

export const billRepository = new BillRepositoryImpl();
