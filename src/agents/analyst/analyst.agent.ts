import { IntentResult, AgentId } from '../../shared/types';
import {
  get_aggregation,
  get_budget_status,
  get_net_balance,
  generate_chart_config,
  get_category_trend,
  get_anomaly_report,
  get_merchant_summary,
  get_yearly_comparison,
} from '../../tools/stats/stats.tool';
import {
  canCallTool,
  rememberMoment,
  getTool,
  executeTool,
} from '../_shared';

const AGENT_ID: AgentId = 'analyst';

export async function handleIntent(intent: IntentResult): Promise<string> {
  switch (intent.intent) {
    case 'get_summary':
      return handleGetSummary(intent.params);
    case 'get_category_trend':
      return handleCategoryTrend(intent.params);
    case 'get_anomaly':
      return handleAnomalyReport(intent.params);
    case 'get_merchants':
      return handleMerchantSummary(intent.params);
    case 'get_yearly':
      return handleYearlyComparison(intent.params);
    case 'get_chart':
      return handleChart(intent.params);
    case 'get_budget_status':
      return handleBudgetStatus(intent.params);
    case 'get_net_balance':
      return handleNetBalance();
    case 'export_data':
      return handleExportData(intent.params);
    default: {
      await rememberMoment(AGENT_ID, `未知意图:${intent.intent}`);
      return '抱歉，我还不太理解您的分析需求。您可以尝试：\n• "查看本月支出统计"\n• "餐饮分类趋势"\n• "分析消费异常"\n• "年度收支对比"';
    }
  }
}

async function handleGetSummary(params: Record<string, unknown>): Promise<string> {
  const period = (params.period as string) || 'month';
  const toolCheck = canCallTool(AGENT_ID, 'get_aggregation');
  if (!toolCheck.allowed) {
    return `操作被拒绝：${toolCheck.reason}`;
  }

  const result = await get_aggregation({ period: period as 'today' | 'week' | 'month' });

  if (!result.success || !result.data) {
    return `获取汇总失败：${result.error}`;
  }

  const data = result.data as {
    totalIncome: number;
    totalExpense: number;
    billCount: number;
    byCategory: Record<string, number>;
  };

  await rememberMoment(AGENT_ID, `汇总分析:${period}|支出¥${data.totalExpense.toFixed(0)}`);

  const periodLabel = period === 'today' ? '今日' : period === 'week' ? '本周' : '本月';
  let reply = `📊 **${periodLabel}统计分析**\n\n`;
  reply += `💰 总收入：¥${data.totalIncome.toFixed(2)}\n`;
  reply += `💸 总支出：¥${data.totalExpense.toFixed(2)}\n`;
  reply += `📝 记录笔数：${data.billCount}\n`;

  if (data.totalIncome > 0 || data.totalExpense > 0) {
    reply += `\n⚖️ 结余：¥${(data.totalIncome - data.totalExpense).toFixed(2)}\n`;
  }

  if (Object.keys(data.byCategory).length > 0) {
    reply += '\n📂 支出分类：\n';
    const entries = Object.entries(data.byCategory)
      .sort((a, b) => b[1] - a[1]);
    const totalExpense = data.totalExpense || 1;
    for (const [cat, amount] of entries) {
      const pct = Math.round((amount / totalExpense) * 100);
      const bar = '█'.repeat(Math.min(pct / 5, 10));
      reply += `  ${getCategoryEmoji(cat)} ${cat}：¥${amount.toFixed(2)} (${pct}%) ${bar}\n`;
    }
  }

  return reply;
}

async function handleCategoryTrend(params: Record<string, unknown>): Promise<string> {
  const result = await get_category_trend({ category: params.category as string });

  if (!result.success || !result.data) {
    return `趋势分析失败：${result.error}`;
  }

  const trends = result.data as {
    category: string;
    currentAmount: number;
    previousAmount: number;
    changePercent: number;
    trend: string;
  }[];

  if (trends.length === 0) {
    return '暂无足够数据用于趋势分析，请至少记录两周后再试。';
  }

  let reply = '📈 **分类趋势分析**\n\n';
  for (const t of trends.slice(0, 8)) {
    const emoji = t.trend === 'up' ? '🔺' : t.trend === 'down' ? '🔻' : '➡️';
    const sign = t.changePercent > 0 ? '+' : '';
    reply += `${emoji} ${t.category}：本月 ¥${t.currentAmount.toFixed(0)} | 上月 ¥${t.previousAmount.toFixed(0)} (${sign}${t.changePercent}%)\n`;
  }

  return reply;
}

async function handleAnomalyReport(params: Record<string, unknown>): Promise<string> {
  const period = (params.period as string) || 'month';
  const result = await get_anomaly_report({ period: period as 'today' | 'week' | 'month' });

  if (!result.success || !result.data) {
    return `异常检测失败：${result.error}`;
  }

  const anomalies = result.data as {
    anomalyType: string;
    severity: string;
    detail: string;
    suggestedAction: string;
  }[];

  if (anomalies.length === 0) {
    return '🔍 未检测到消费异常，您的财务状况看起来很健康！';
  }

  let reply = `⚠️ **消费异常报告** (发现 ${anomalies.length} 项)\n\n`;
  for (const a of anomalies) {
    const sevEmoji = a.severity === 'high' ? '🔴' : a.severity === 'medium' ? '🟡' : '🟢';
    reply += `${sevEmoji} ${a.detail}\n`;
    reply += `   💡 建议：${a.suggestedAction}\n\n`;
  }

  return reply;
}

async function handleMerchantSummary(params: Record<string, unknown>): Promise<string> {
  const period = (params.period as string) || 'month';
  const result = await get_merchant_summary({
    period: period as 'today' | 'week' | 'month',
    limit: (params.limit as number) || 10,
  });

  if (!result.success || !result.data) {
    return `商家汇总失败：${result.error}`;
  }

  const summaries = result.data as {
    merchant: string;
    totalAmount: number;
    count: number;
    avgAmount: number;
    lastDate: string;
  }[];

  if (summaries.length === 0) {
    return '该时间段内没有商家消费记录。';
  }

  const periodLabel = period === 'today' ? '今日' : period === 'week' ? '本周' : '本月';
  let reply = `🏪 **${periodLabel}商家消费排行**\n\n`;
  for (let i = 0; i < summaries.length; i++) {
    const s = summaries[i];
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
    reply += `${medal} ${s.merchant}：共 ¥${s.totalAmount.toFixed(0)} (${s.count}笔，均价 ¥${s.avgAmount.toFixed(0)})\n`;
  }

  return reply;
}

async function handleYearlyComparison(params: Record<string, unknown>): Promise<string> {
  const year = params.year as number;
  const result = await get_yearly_comparison({ year });

  if (!result.success || !result.data) {
    return `年度对比失败：${result.error}`;
  }

  const data = result.data as {
    year: number;
    totalIncome: number;
    totalExpense: number;
    monthBreakdown: { month: number; income: number; expense: number }[];
  };

  let reply = `📅 **${data.year} 年收支分析**\n\n`;
  reply += `💰 年度收入：¥${data.totalIncome.toFixed(2)}\n`;
  reply += `💸 年度支出：¥${data.totalExpense.toFixed(2)}\n`;
  reply += `⚖️ 年度结余：¥${(data.totalIncome - data.totalExpense).toFixed(2)}\n`;
  reply += '\n月度明细：\n';

  for (const m of data.monthBreakdown) {
    const balance = m.income - m.expense;
    const icon = balance > 0 ? '🟢' : '🔴';
    reply += `${icon} ${m.month}月：收 ¥${m.income.toFixed(0)} | 支 ¥${m.expense.toFixed(0)} | 结余 ¥${balance.toFixed(0)}\n`;
  }

  return reply;
}

async function handleChart(params: Record<string, unknown>): Promise<string> {
  const chartType = (params.chartType as string) || 'pie';
  const period = (params.period as string) || 'month';
  const result = await generate_chart_config({
    chartType: chartType as 'pie' | 'line' | 'bar' | 'sankey' | 'radar' | 'heatmap' | 'gauge',
    period: period as 'today' | 'week' | 'month',
    category: params.category as string,
  });

  if (!result.success) {
    return `生成图表失败：${result.error}`;
  }

  const chartLabel =
    chartType === 'pie' ? '分类饼图' :
    chartType === 'bar' ? '收支柱状图' :
    chartType === 'line' ? '支出趋势折线图' :
    chartType === 'gauge' ? '预算仪表盘' : '图表';

  return `📊 **${chartLabel}**\n\n图表配置已生成，点击卡片可查看详细图表。`;
}

async function handleBudgetStatus(params: Record<string, unknown>): Promise<string> {
  const result = await get_budget_status({ category: params.category as string });

  if (!result.success || !result.data) {
    return `预算查询失败：${result.error}`;
  }

  const statuses = result.data as {
    category: string;
    limit: number;
    spent: number;
    remaining: number;
    percentUsed: number;
  }[];

  if (statuses.length === 0) {
    return '您还没有设置任何预算。说"设置餐饮预算 3000"来创建预算吧！';
  }

  let reply = '📊 **预算执行情况**\n\n';
  for (const s of statuses) {
    const icon = s.percentUsed > 90 ? '🔴' : s.percentUsed > 60 ? '🟡' : '🟢';
    const bar = '█'.repeat(Math.min(Math.ceil(s.percentUsed / 10), 10)) + '░'.repeat(Math.max(0, 10 - Math.ceil(s.percentUsed / 10)));
    reply += `${icon} ${s.category}：¥${s.spent.toFixed(0)} / ¥${s.limit.toFixed(0)} [${bar}] ${s.percentUsed}%\n`;
    reply += `   剩余 ¥${s.remaining.toFixed(0)}\n\n`;
  }

  return reply;
}

async function handleNetBalance(): Promise<string> {
  const result = await get_net_balance();

  if (!result.success || !result.data) {
    return `净资产查询失败：${result.error}`;
  }

  const data = result.data as {
    totalAssets: number;
    totalDebt: number;
    netWorth: number;
    cashBalance: number;
  };

  let reply = '💰 **净资产概览**\n\n';
  reply += `📈 总资产 (累计收入)：¥${data.totalAssets.toFixed(2)}\n`;
  reply += `📉 总负债 (累计支出)：¥${data.totalDebt.toFixed(2)}\n`;
  reply += `💎 净资产：¥${data.netWorth.toFixed(2)}\n`;

  if (data.netWorth > 0) {
    reply += '\n✅ 净资产为正，财务状况健康。';
  } else if (data.netWorth < 0) {
    reply += '\n⚠️ 净资产为负，建议控制支出。';
  }

  return reply;
}

function getCategoryEmoji(cat: string): string {
  const map: Record<string, string> = {
    '餐饮': '🍜', '交通': '🚗', '购物': '🛒', '住房': '🏠',
    '娱乐': '🎮', '医疗': '💊', '教育': '📚', '水电': '💡',
    '其他': '📦', '工资': '💰', '奖金': '🎁', '投资': '📈',
  };
  return map[cat] || '📦';
}

async function handleExportData(params: Record<string, unknown>): Promise<string> {
  const tool = getTool('export_csv');
  if (!tool) return '导出功能暂不可用。';
  const result = await executeTool(tool, params, { agentId: AGENT_ID });
  if (result.success && result.data) {
    const data = result.data as { rowCount: number; filename: string; filePath?: string };
    let reply = `已导出 ${data.rowCount} 条账单到 "${data.filename}"`;
    if (data.filePath) reply += `\n保存位置: ${data.filePath}`;
    return reply;
  }
  return `导出失败: ${result.error}`;
}
