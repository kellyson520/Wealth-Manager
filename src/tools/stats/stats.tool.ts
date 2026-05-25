import { captureError } from '../../core/logger/logger';
import { getDatabase } from '../../core/database/database';
import {
  AggregationResult,
  CategoryTrend,
  AnomalyReport,
  MerchantSummary,
  YearlyComparison,
  NetBalance,
  ToolResult,
} from '../../shared/types';

export async function get_aggregation(params: {
  period?: 'today' | 'week' | 'month';
}): Promise<ToolResult> {
  const db = await getDatabase();
  const startDate = getStartDate(params.period);

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
    captureError('StatsTool.get_aggregation', e, 'Aggregation query failed');
    return { success: false, error: '统计失败', errorCode: '1000' };
  }
}

export async function get_budget_status(params: {
  category?: string;
}): Promise<ToolResult> {
  const db = await getDatabase();
  try {
    const profileRow = await db.getFirstAsync<{ budget_limits: string }>(
      "SELECT budget_limits FROM user_profile WHERE id = 'singleton'"
    );
    const limits = JSON.parse(profileRow?.budget_limits || '[]');

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];

    const statuses: {
      category: string;
      limit: number;
      spent: number;
      remaining: number;
      percentUsed: number;
    }[] = [];

    for (const limit of limits) {
      if (params.category && limit.category !== params.category) continue;

      const expenseRow = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'expense' AND category = ? AND date >= ?`,
        [limit.category, monthStart]
      );

      const spent = expenseRow?.total || 0;
      statuses.push({
        category: limit.category,
        limit: limit.limit,
        spent,
        remaining: Math.max(0, limit.limit - spent),
        percentUsed: limit.limit > 0 ? Math.round((spent / limit.limit) * 100) : 0,
      });
    }

    return { success: true, data: statuses };
  } catch (e) {
    captureError('StatsTool.get_budget_status', e, 'Budget status query failed');
    return { success: false, error: '预算查询失败', errorCode: '1000' };
  }
}

export async function get_net_balance(): Promise<ToolResult> {
  const db = await getDatabase();
  try {
    const incomeRow = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'income'`
    );
    const expenseRow = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'expense'`
    );

    const result: NetBalance = {
      totalAssets: incomeRow?.total || 0,
      totalDebt: expenseRow?.total || 0,
      netWorth: (incomeRow?.total || 0) - (expenseRow?.total || 0),
      cashBalance: (incomeRow?.total || 0) - (expenseRow?.total || 0),
    };

    return { success: true, data: result };
  } catch (e) {
    captureError('StatsTool.get_net_balance', e, 'Net balance query failed');
    return { success: false, error: '净资产查询失败', errorCode: '1000' };
  }
}

export async function generate_chart_config(params: {
  chartType: 'pie' | 'line' | 'bar' | 'sankey' | 'radar' | 'heatmap' | 'gauge';
  period?: 'today' | 'week' | 'month';
  category?: string;
}): Promise<ToolResult> {
  const db = await getDatabase();
  const startDate = getStartDate(params.period);
  const periodLabel = params.period === 'today' ? '今日' : params.period === 'week' ? '本周' : '本月';

  try {
    const config: Record<string, unknown> = {
      chartType: params.chartType,
      title: `${periodLabel}${params.category ? ` - ${params.category}` : ''}`,
      period: params.period || 'month',
    };

    if (params.chartType === 'pie') {
      const rows = await db.getAllAsync<{ category: string; total: number }>(
        `SELECT category, SUM(amount) as total FROM bills WHERE type = 'expense' AND date >= ? GROUP BY category ORDER BY total DESC`,
        [startDate]
      );
      config.series = {
        type: 'pie',
        radius: ['40%', '70%'],
        data: rows.map(r => ({ name: r.category, value: r.total })),
      };
    } else if (params.chartType === 'bar') {
      const now = new Date();
      const months: { month: string; income: number; expense: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mStart = d.toISOString().split('T')[0];
        const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
        const inc = await db.getFirstAsync<{ total: number }>(
          `SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'income' AND date >= ? AND date <= ?`,
          [mStart, mEnd]
        );
        const exp = await db.getFirstAsync<{ total: number }>(
          `SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'expense' AND date >= ? AND date <= ?`,
          [mStart, mEnd]
        );
        months.push({
          month: `${d.getMonth() + 1}月`,
          income: inc?.total || 0,
          expense: exp?.total || 0,
        });
      }
      config.series = {
        type: 'bar',
        xAxis: months.map(m => m.month),
        data: [
          { name: '收入', data: months.map(m => m.income) },
          { name: '支出', data: months.map(m => m.expense) },
        ],
      };
    } else if (params.chartType === 'line') {
      const rows = await db.getAllAsync<{ date: string; total: number }>(
        `SELECT date, SUM(amount) as total FROM bills WHERE type = 'expense' AND date >= ? GROUP BY date ORDER BY date`,
        [startDate]
      );
      config.series = {
        type: 'line',
        xAxis: rows.map(r => r.date),
        data: [{ name: '支出', data: rows.map(r => r.total) }],
      };
    } else if (params.chartType === 'gauge') {
      const category = params.category || '餐饮';
      const expenseRow = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'expense' AND category = ? AND date >= ?`,
        [category, startDate]
      );
      const profileRow = await db.getFirstAsync<{ budget_limits: string }>(
        "SELECT budget_limits FROM user_profile WHERE id = 'singleton'"
      );
      const limits = JSON.parse(profileRow?.budget_limits || '[]');
      const limit = limits.find((l: { category: string }) => l.category === category);
      const maxVal = limit ? limit.limit : 1000;
      config.series = {
        type: 'gauge',
        data: [{ value: expenseRow?.total || 0, max: maxVal }],
      };
    }

    return { success: true, data: config };
  } catch (e) {
    captureError('StatsTool.generate_chart_config', e, 'Chart config generation failed');
    return { success: false, error: '生成图表配置失败', errorCode: '1000' };
  }
}

export async function get_category_trend(params: {
  category?: string;
}): Promise<ToolResult> {
  const db = await getDatabase();
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

  try {
    const rows = await db.getAllAsync<{ category: string; total: number }>(
      `SELECT category, SUM(amount) as total FROM bills WHERE type = 'expense' AND date >= ? GROUP BY category`,
      [thisMonthStart]
    );

    const trends: CategoryTrend[] = [];
    for (const row of rows) {
      if (params.category && row.category !== params.category) continue;

      const prevRow = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'expense' AND category = ? AND date >= ? AND date <= ?`,
        [row.category, lastMonthStart, lastMonthEnd]
      );

      const prevTotal = prevRow?.total || 0;
      const changePercent = prevTotal > 0
        ? Math.round(((row.total - prevTotal) / prevTotal) * 100)
        : 100;

      trends.push({
        category: row.category,
        currentAmount: row.total,
        previousAmount: prevTotal,
        changePercent,
        trend: changePercent > 5 ? 'up' : changePercent < -5 ? 'down' : 'stable',
      });
    }

    return { success: true, data: trends };
  } catch (e) {
    captureError('StatsTool.get_category_trend', e, 'Category trend query failed');
    return { success: false, error: '趋势分析失败', errorCode: '1000' };
  }
}

export async function get_anomaly_report(params: {
  period?: 'today' | 'week' | 'month';
}): Promise<ToolResult> {
  const db = await getDatabase();
  const startDate = getStartDate(params.period || 'month');

  try {
    const anomalies: AnomalyReport[] = [];

    const avgRow = await db.getFirstAsync<{ avg: number }>(
      `SELECT AVG(amount) as avg FROM bills WHERE type = 'expense'`
    );
    const avgAmount = avgRow?.avg || 100;

    const highBills = await db.getAllAsync<{ id: string; amount: number; merchant: string; date: string }>(
      `SELECT id, amount, merchant, date FROM bills WHERE type = 'expense' AND date >= ? AND amount > ? * 3 ORDER BY amount DESC`,
      [startDate, avgAmount]
    );

    for (const b of highBills) {
      anomalies.push({
        billId: b.id,
        anomalyType: 'amount_spike',
        severity: b.amount > avgAmount * 5 ? 'high' : 'medium',
        detail: `${b.merchant} ¥${b.amount.toFixed(2)} (历史均值 ¥${avgAmount.toFixed(2)})`,
        suggestedAction: '请确认这笔消费是否正确',
      });
    }

    const freqResult = await db.getAllAsync<{ date: string; count: number }>(
      `SELECT date, COUNT(*) as count FROM bills WHERE type = 'expense' AND date >= ? GROUP BY date HAVING count > 10`,
      [startDate]
    );

    for (const f of freqResult) {
      anomalies.push({
        billId: '',
        anomalyType: 'high_frequency',
        severity: f.count > 20 ? 'high' : 'medium',
        detail: `${f.date} 共有 ${f.count} 笔支出`,
        suggestedAction: '请检查当日消费记录是否有误',
      });
    }

    return { success: true, data: anomalies };
  } catch (e) {
    captureError('StatsTool.get_anomaly_report', e, 'Anomaly report generation failed');
    return { success: false, error: '异常检测失败', errorCode: '1000' };
  }
}

export async function get_merchant_summary(params: {
  period?: 'today' | 'week' | 'month';
  limit?: number;
}): Promise<ToolResult> {
  const db = await getDatabase();
  const startDate = getStartDate(params.period);

  try {
    const rows = await db.getAllAsync<{
      merchant: string;
      total_amount: number;
      count: number;
      last_date: string;
    }>(
      `SELECT merchant, SUM(amount) as total_amount, COUNT(*) as count, MAX(date) as last_date
       FROM bills WHERE type = 'expense' AND date >= ? AND merchant != ''
       GROUP BY merchant ORDER BY total_amount DESC LIMIT ?`,
      [startDate, params.limit || 20]
    );

    const summaries: MerchantSummary[] = rows.map(r => ({
      merchant: r.merchant,
      totalAmount: r.total_amount,
      count: r.count,
      avgAmount: r.count > 0 ? Math.round(r.total_amount / r.count * 100) / 100 : 0,
      lastDate: r.last_date,
    }));

    return { success: true, data: summaries };
  } catch (e) {
    captureError('StatsTool.get_merchant_summary', e, 'Merchant summary query failed');
    return { success: false, error: '商家汇总失败', errorCode: '1000' };
  }
}

export async function get_yearly_comparison(params: {
  year?: number;
}): Promise<ToolResult> {
  const db = await getDatabase();
  const year = params.year || new Date().getFullYear();

  try {
    const comparison: YearlyComparison = {
      year,
      totalIncome: 0,
      totalExpense: 0,
      monthBreakdown: [],
    };

    for (let m = 1; m <= 12; m++) {
      const start = `${year}-${String(m).padStart(2, '0')}-01`;
      const end = new Date(year, m, 0).toISOString().split('T')[0];

      const inc = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'income' AND date >= ? AND date <= ?`,
        [start, end]
      );
      const exp = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'expense' AND date >= ? AND date <= ?`,
        [start, end]
      );

      comparison.totalIncome += inc?.total || 0;
      comparison.totalExpense += exp?.total || 0;
      comparison.monthBreakdown.push({
        month: m,
        income: inc?.total || 0,
        expense: exp?.total || 0,
      });
    }

    return { success: true, data: comparison };
  } catch (e) {
    captureError('StatsTool.get_yearly_comparison', e, 'Yearly comparison query failed');
    return { success: false, error: '年度对比失败', errorCode: '1000' };
  }
}

function getStartDate(period?: string): string {
  const now = new Date();
  switch (period || 'today') {
    case 'today':
      return now.toISOString().split('T')[0];
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    default:
      return now.toISOString().split('T')[0];
  }
}
