import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../core/database/database';
import { SavingsGoal, ToolResult } from '../../shared/types';

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
    return { success: false, error: '查询储蓄进度失败', errorCode: '1000' };
  }
}
