import { v4 as uuidv4 } from 'uuid';
import { captureError } from '../../core/logger/logger';
import { getDatabase } from '../../core/database/database';
import { SavingsGoal, ToolResult, BudgetOverrunAlert } from '../../shared/types';

export async function set_budget(params: {
  category: string;
  limit: number;
  period?: 'monthly' | 'weekly';
}): Promise<ToolResult> {
  if (!params.category || params.limit <= 0) {
    return { success: false, error: '请输入有效的分类和预算金额', errorCode: '1002' };
  }

  const db = await getDatabase();
  const period = params.period || 'monthly';

  try {
    const profileRow = await db.getFirstAsync<{ budget_limits: string }>(
      "SELECT budget_limits FROM user_profile WHERE id = 'singleton'"
    );
    const limits = JSON.parse(profileRow?.budget_limits || '[]');
    const existing = limits.findIndex(
      (l: { category: string }) => l.category === params.category
    );

    const newLimit = { category: params.category, limit: params.limit, period };

    if (existing >= 0) {
      limits[existing] = newLimit;
    } else {
      limits.push(newLimit);
    }

    await db.runAsync(
      "UPDATE user_profile SET budget_limits = ? WHERE id = 'singleton'",
      [JSON.stringify(limits)]
    );

    return { success: true, data: newLimit };
  } catch (e) {
    captureError('BudgetTool.set_budget', e, 'Set budget failed');
    return { success: false, error: '设置预算失败', errorCode: '1000' };
  }
}

export async function create_savings_goal(params: {
  name: string;
  targetAmount: number;
  deadline?: string;
}): Promise<ToolResult> {
  if (!params.name || params.targetAmount <= 0) {
    return { success: false, error: '请输入有效的目标名称和金额', errorCode: '1002' };
  }

  const db = await getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  try {
    await db.runAsync(
      `INSERT INTO savings_goals (id, name, target_amount, current_amount, deadline, created_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
      [id, params.name, params.targetAmount, params.deadline || null, now]
    );

    const goal = await db.getFirstAsync<SavingsGoal>(
      'SELECT * FROM savings_goals WHERE id = ?',
      [id]
    );

    return { success: true, data: goal };
  } catch (e) {
    captureError('BudgetTool.create_savings_goal', e, 'Create savings goal failed');
    return { success: false, error: '创建储蓄目标失败', errorCode: '1000' };
  }
}

export async function get_savings_progress(params: {
  goalId?: string;
}): Promise<ToolResult> {
  const db = await getDatabase();

  try {
    if (params.goalId) {
      const goal = await db.getFirstAsync<SavingsGoal>(
        'SELECT * FROM savings_goals WHERE id = ?',
        [params.goalId]
      );
      return { success: true, data: goal ? [goal] : [] };
    }

    const goals = await db.getAllAsync<SavingsGoal>(
      'SELECT * FROM savings_goals ORDER BY deadline ASC'
    );
    return { success: true, data: goals };
  } catch (e) {
    captureError('BudgetTool.get_savings_progress', e, 'Get savings progress failed');
    return { success: false, error: '查询储蓄进度失败', errorCode: '1000' };
  }
}

export async function check_budget_overrun(params: {
  category?: string;
  amount?: number;
}): Promise<ToolResult> {
  const db = await getDatabase();

  try {
    const profileRow = await db.getFirstAsync<{ budget_limits: string }>(
      "SELECT budget_limits FROM user_profile WHERE id = 'singleton'"
    );
    const limits = JSON.parse(profileRow?.budget_limits || '[]');

    if (limits.length === 0) {
      return { success: true, data: { alerts: [], hasOverrun: false } };
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];

    const alerts: BudgetOverrunAlert[] = [];

    for (const limit of limits) {
      if (params.category && limit.category !== params.category) continue;

      const expenseRow = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'expense' AND category = ? AND date >= ?`,
        [limit.category, monthStart]
      );

      const spent = expenseRow?.total || 0;
      const percentUsed = limit.limit > 0 ? Math.round((spent / limit.limit) * 100) : 0;

      if (percentUsed >= 80) {
        alerts.push({
          category: limit.category,
          limit: limit.limit,
          spent,
          percentUsed,
          severity: percentUsed >= 100 ? 'overrun' : 'warning',
          message:
            percentUsed >= 100
              ? `⚠️ ${limit.category}预算已超标！已花 ¥${spent.toFixed(0)} / ¥${limit.limit.toFixed(0)}`
              : `⚡ ${limit.category}预算即将用尽：已花 ¥${spent.toFixed(0)} / ¥${limit.limit.toFixed(0)} (${percentUsed}%)`,
        });
      }
    }

    const hasOverrun = alerts.some(a => a.severity === 'overrun');

    return { success: true, data: { alerts, hasOverrun } };
  } catch (e) {
    captureError('BudgetTool.check_budget_overrun', e, 'Check budget overrun failed');
    return { success: false, error: '预算检查失败', errorCode: '1000' };
  }
}

export async function update_savings_progress(params: {
  goalId?: string;
}): Promise<ToolResult> {
  const db = await getDatabase();

  try {
    const incomeRow = await db.getFirstAsync<{ total: number }>(
      "SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'income'"
    );
    const totalIncome = incomeRow?.total || 0;

    const goals = params.goalId
      ? await db.getAllAsync<SavingsGoal>('SELECT * FROM savings_goals WHERE id = ?', [params.goalId])
      : await db.getAllAsync<SavingsGoal>('SELECT * FROM savings_goals');

    const updated: SavingsGoal[] = [];

    for (const goal of goals) {
      const expenseResult = await db.getFirstAsync<{ total: number }>(
        "SELECT COALESCE(SUM(amount), 0) as total FROM bills WHERE type = 'expense'"
      );
      const totalExpense = expenseResult?.total || 0;
      const savingsRate = 0.2;
      const estimatedSavings = Math.max(0, (totalIncome - totalExpense) * savingsRate);
      const newAmount = Math.min(estimatedSavings, goal.targetAmount);

      await db.runAsync(
        'UPDATE savings_goals SET current_amount = ? WHERE id = ?',
        [newAmount, goal.id]
      );

      updated.push({ ...goal, currentAmount: newAmount });
    }

    return { success: true, data: updated };
  } catch (e) {
    captureError('BudgetTool.update_savings_progress', e, 'Update savings progress failed');
    return { success: false, error: '更新储蓄进度失败', errorCode: '1000' };
  }
}
