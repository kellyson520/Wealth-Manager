import { getDatabase } from '../../core/database/database';
import { AggregationResult, ToolResult } from '../../shared/types';

export async function get_aggregation(params: {
  period?: 'today' | 'week' | 'month';
}): Promise<ToolResult> {
  const db = await getDatabase();
  const now = new Date();
  let startDate: string;

  switch (params.period || 'today') {
    case 'today':
      startDate = now.toISOString().split('T')[0];
      break;
    case 'week':
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      startDate = weekAgo.toISOString().split('T')[0];
      break;
    case 'month':
      const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      startDate = monthAgo.toISOString().split('T')[0];
      break;
    default:
      startDate = now.toISOString().split('T')[0];
  }

  try {
    const incomeResult = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'income' AND date >= ?`,
      [startDate]
    );

    const expenseResult = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'expense' AND date >= ?`,
      [startDate]
    );

    const countResult = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM bills WHERE date >= ?`,
      [startDate]
    );

    const categoryRows = await db.getAllAsync<{ category: string; total: number }>(
      `SELECT category, SUM(amount) as total FROM bills WHERE type = 'expense' AND date >= ? GROUP BY category ORDER BY total DESC`,
      [startDate]
    );

    const byCategory: Record<string, number> = {};
    for (const row of categoryRows) {
      byCategory[row.category] = row.total;
    }

    const result: AggregationResult = {
      totalIncome: incomeResult?.total || 0,
      totalExpense: expenseResult?.total || 0,
      billCount: countResult?.count || 0,
      byCategory,
    };

    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: '统计失败', errorCode: '1000' };
  }
}
