import { getDatabase } from '../../core/database/database';
import { captureError } from '../../core/logger/logger';
import {
  ProactiveFindings,
  BudgetOverrunAlert,
  ToolResult,
  Achievement,
  SavingsGoal,
} from '../../shared/types';
import { get_budget_status } from '../stats/stats.tool';
import { get_achievement } from '../gamification/gamification.tool';
import { get_savings_progress } from '../budget/budget.tool';
import { evaluate_all_scenarios } from '../automation/scenario-triggers';

export async function run_proactive_check(): Promise<ToolResult> {
  const now = new Date().toISOString();

  try {
    const [budgetAlerts, inactivityAlert, upcomingAchievements, savingsUpdates, insights, _scenarios] =
      await Promise.all([
        checkBudgetHealth(),
        checkRecordingInactivity(),
        checkUpcomingAchievements(),
        checkSavingsProgress(),
        generateProactiveInsights(),
        evaluate_all_scenarios(),
      ]);

    const findings: ProactiveFindings = {
      timestamp: now,
      budgetAlerts,
      inactivityAlert,
      upcomingAchievements,
      savingsUpdates,
      insights,
    };

    return { success: true, data: findings };
  } catch (e) {
    captureError('ProactiveTool.run_proactive_check', e, 'Proactive check failed');
    return { success: false, error: '主动服务检查失败', errorCode: '1000' };
  }
}

async function checkBudgetHealth(): Promise<BudgetOverrunAlert[]> {
  try {
    const result = await get_budget_status({});
    if (!result.success || !result.data) return [];

    const statuses = result.data as {
      category: string;
      limit: number;
      spent: number;
      remaining: number;
      percentUsed: number;
    }[];

    return statuses
      .filter(s => s.percentUsed >= 80)
      .map(s => ({
        category: s.category,
        limit: s.limit,
        spent: s.spent,
        percentUsed: s.percentUsed,
        severity: (s.percentUsed >= 100 ? 'overrun' : 'warning') as 'warning' | 'overrun',
        message:
          s.percentUsed >= 100
            ? `⚠️ ${s.category}预算已超标！已花 ¥${s.spent.toFixed(0)} / ¥${s.limit.toFixed(0)}`
            : `⚡ ${s.category}预算即将用尽：已花 ¥${s.spent.toFixed(0)} / ¥${s.limit.toFixed(0)} (${s.percentUsed}%)`,
      }));
  } catch (e) {
    captureError('ProactiveTool.checkBudgetHealth', e, 'Budget health check failed');
    return [];
  }
}

async function checkRecordingInactivity(): Promise<{
  daysSinceLastRecord: number;
  shouldNotify: boolean;
} | null> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ date: string }>(
      "SELECT date FROM bills WHERE date IS NOT NULL GROUP BY date ORDER BY date DESC LIMIT 1"
    );

    const lastRecordDate = rows[0]?.date || '';
    let daysSinceLastRecord = 0;

    if (lastRecordDate) {
      const lastDate = new Date(lastRecordDate);
      const now = new Date();
      daysSinceLastRecord = Math.floor(
        (now.getTime() - lastDate.getTime()) / 86400000
      );
    } else {
      daysSinceLastRecord = 999;
    }

    const shouldNotify = daysSinceLastRecord >= 3;

    return { daysSinceLastRecord, shouldNotify };
  } catch (e) {
    captureError('ProactiveTool.checkInactivity', e, 'Inactivity check failed');
    return null;
  }
}

async function checkUpcomingAchievements(): Promise<
  { name: string; progress: number; maxProgress: number; percent: number }[]
> {
  try {
    const result = await get_achievement({});
    if (!result.success || !result.data) return [];

    const achievements = result.data as Achievement[];

    return achievements
      .filter(a => !a.unlocked && a.progress > 0)
      .map(a => ({
        name: a.name,
        progress: a.progress,
        maxProgress: a.maxProgress,
        percent: a.maxProgress > 0 ? Math.round((a.progress / a.maxProgress) * 100) : 0,
      }))
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 3);
  } catch (e) {
    captureError('ProactiveTool.checkAchievements', e, 'Achievement check failed');
    return [];
  }
}

async function checkSavingsProgress(): Promise<
  { name: string; currentAmount: number; targetAmount: number; percent: number; onTrack: boolean }[]
> {
  try {
    const result = await get_savings_progress({});
    if (!result.success || !result.data) return [];

    const goals = result.data as SavingsGoal[];

    return goals
      .map(g => {
        const percent = g.targetAmount > 0
          ? Math.round((g.currentAmount / g.targetAmount) * 100)
          : 0;

        let onTrack = true;
        if (g.deadline) {
          const deadlineDate = new Date(g.deadline);
          const now = new Date();
          const totalDays = Math.ceil(
            (deadlineDate.getTime() - new Date(g.createdAt).getTime()) / 86400000
          );
          const daysLeft = Math.max(
            0,
            Math.ceil((deadlineDate.getTime() - now.getTime()) / 86400000)
          );
          const daysPassed = totalDays - daysLeft;
          const expectedProgress = totalDays > 0
            ? Math.round((daysPassed / totalDays) * 100)
            : 0;
          onTrack = percent >= expectedProgress;
        }

        return {
          name: g.name,
          currentAmount: g.currentAmount,
          targetAmount: g.targetAmount,
          percent,
          onTrack,
        };
      })
      .sort((a, b) => a.onTrack === b.onTrack ? b.percent - a.percent : (a.onTrack ? 1 : -1));
  } catch (e) {
    captureError('ProactiveTool.checkSavings', e, 'Savings check failed');
    return [];
  }
}

async function generateProactiveInsights(): Promise<string[]> {
  const insights: string[] = [];

  try {
    const db = await getDatabase();
    const today = new Date().toISOString().split('T')[0];
    const thisMonthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    ).toISOString().split('T')[0];

    const [expenseRow, incomeRow, topCategory, billCount, todayCount, monthBillCount] =
      await Promise.all([
        db.getFirstAsync<{ total: number }>(
          "SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'expense'"
        ),
        db.getFirstAsync<{ total: number }>(
          "SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'income'"
        ),
        db.getFirstAsync<{ category: string; total: number }>(
          "SELECT category, SUM(amount) as total FROM bills WHERE type = 'expense' GROUP BY category ORDER BY total DESC LIMIT 1"
        ),
        db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM bills'
        ),
        db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM bills WHERE date = ?',
          [today]
        ),
        db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM bills WHERE date >= ?',
          [thisMonthStart]
        ),
      ]);

    const totalExpense = expenseRow?.total || 0;
    const totalIncome = incomeRow?.total || 0;

    if (totalIncome > 0) {
      const savingsRate = Math.round(((totalIncome - totalExpense) / totalIncome) * 100);
      if (savingsRate >= 30) {
        insights.push(`💰 优秀！你的储蓄率为 ${savingsRate}%，远超 20% 的推荐值`);
      } else if (savingsRate >= 20) {
        insights.push(`✅ 你的储蓄率为 ${savingsRate}%，达到了 20% 的推荐标准`);
      } else if (savingsRate >= 0) {
        insights.push(`📊 当前储蓄率为 ${savingsRate}%，建议增加到 20% 以上`);
      } else {
        insights.push('⚠️ 当前支出大于收入，需要关注收支平衡');
      }
    }

    if (topCategory && topCategory.total > 0) {
      const pctOfExpense = totalExpense > 0
        ? Math.round((topCategory.total / totalExpense) * 100)
        : 0;

      if (pctOfExpense > 40) {
        insights.push(
          `🔍 ${topCategory.category}消费占总支出 ${pctOfExpense}%，建议留意是否可优化`
        );
      }
    }

    if (billCount && billCount.count > 0) {
      if (!todayCount || todayCount.count === 0) {
        insights.push('📝 今天还没有记账，记得记录今天的收支哦');
      }
    }

    if (monthBillCount && monthBillCount.count >= 50) {
      insights.push('📊 本月已记录 50+ 笔账单，是否要做一个月度总结？');
    }

    const daysInMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0
    ).getDate();
    const todayDate = new Date().getDate();

    if (todayDate >= daysInMonth - 3) {
      insights.push('🗓️ 快到月底了，记得查看本月的预算执行情况');
    }

    if (insights.length === 0) {
      insights.push('一切正常！继续保持良好的记账习惯 👍');
    }

    return insights;
  } catch (e) {
    captureError('ProactiveTool.generateInsights', e, 'Generate insights failed');
    return ['欢迎使用财富管理助手！开始记账获取个性化建议。'];
  }
}

export async function get_proactive_insights(): Promise<ToolResult> {
  try {
    const insights = await generateProactiveInsights();
    return { success: true, data: { insights } };
  } catch (e) {
    captureError('ProactiveTool.get_insights', e, 'Get insights failed');
    return { success: false, error: '获取洞察失败', errorCode: '1000' };
  }
}

export async function get_today_summary(): Promise<ToolResult> {
  const db = await getDatabase();
  const today = new Date().toISOString().split('T')[0];
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  ).toISOString().split('T')[0];

  try {
    const [todayIncome, todayExpense, todayCount, monthIncome, monthExpense, monthCount, budgetStatus] =
      await Promise.all([
        db.getFirstAsync<{ total: number }>(
          "SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'income' AND date = ?",
          [today]
        ),
        db.getFirstAsync<{ total: number }>(
          "SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'expense' AND date = ?",
          [today]
        ),
        db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM bills WHERE date = ?',
          [today]
        ),
        db.getFirstAsync<{ total: number }>(
          "SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'income' AND date >= ?",
          [monthStart]
        ),
        db.getFirstAsync<{ total: number }>(
          "SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'expense' AND date >= ?",
          [monthStart]
        ),
        db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM bills WHERE date >= ?',
          [monthStart]
        ),
        getBudgetStatusForSummary(),
      ]);

    return {
      success: true,
      data: {
        today: {
          income: todayIncome?.total || 0,
          expense: todayExpense?.total || 0,
          count: todayCount?.count || 0,
        },
        month: {
          income: monthIncome?.total || 0,
          expense: monthExpense?.total || 0,
          count: monthCount?.count || 0,
        },
        budgetStatus,
      },
    };
  } catch (e) {
    captureError('ProactiveTool.get_today_summary', e, 'Today summary failed');
    return { success: false, error: '获取今日概览失败', errorCode: '1000' };
  }
}

async function getBudgetStatusForSummary(): Promise<
  { category: string; percentUsed: number; remaining: number }[]
> {
  try {
    const result = await get_budget_status({});
    if (!result.success || !result.data) return [];

    const statuses = result.data as {
      category: string;
      percentUsed: number;
      remaining: number;
    }[];

    return statuses
      .filter(s => s.percentUsed >= 50)
      .map(s => ({
        category: s.category,
        percentUsed: s.percentUsed,
        remaining: s.remaining,
      }))
      .sort((a, b) => b.percentUsed - a.percentUsed)
      .slice(0, 3);
  } catch {
    return [];
  }
}
