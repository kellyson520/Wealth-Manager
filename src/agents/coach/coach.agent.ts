import { IntentResult, AgentId } from '../../shared/types';
import { set_budget, create_savings_goal, get_savings_progress } from '../../tools/budget/budget.tool';
import { get_streak_info, get_achievement } from '../../tools/gamification/gamification.tool';
import { get_budget_status } from '../../tools/stats/stats.tool';
import { run_proactive_check, get_proactive_insights, get_today_summary } from '../../tools/proactive/proactive.tool';
import {
  canCallTool,
  rememberThis,
  rememberMoment,
  getTool,
} from '../_shared';

const AGENT_ID: AgentId = 'coach';

export async function handleIntent(intent: IntentResult): Promise<string> {
  switch (intent.intent) {
    case 'set_budget':
      return handleSetBudget(intent.params);
    case 'create_savings_goal':
      return handleCreateSavingsGoal(intent.params);
    case 'get_savings':
      return handleGetSavings(intent.params);
    case 'get_advice':
      return handleGetAdvice(intent.params);
    case 'get_streak':
      return handleGetStreak();
    case 'get_achievements':
      return handleGetAchievements(intent.params);
    case 'greeting':
      return handleGreeting();
    case 'proactive_check':
      return handleProactiveCheck();
    case 'proactive_insights':
      return handleProactiveInsights();
    case 'today_summary':
      return handleTodaySummary();
    case 'setup_reminder':
      return handleSetupReminder(intent.params);
    case 'list_tags':
      return handleListTags(intent.params);
    case 'share_bills':
      return handleShareBills(intent.params);
    case 'level_status':
      return handleLevelStatus(intent.params);
    default:
      return '我可以帮您：\n• "设置餐饮预算 3000" — 设定预算\n• "创建储蓄目标" — 存钱计划\n• "查看打卡天数" — 记账连续天数\n• "我的成就" — 成就展示\n• "省钱建议" — 预算建议';
  }
}

async function handleSetBudget(params: Record<string, unknown>): Promise<string> {
  const budgets = Array.isArray(params.budgets)
    ? params.budgets as { category?: string; limit?: number }[]
    : [];

  if (budgets.length > 0) {
    const validBudgets = budgets.filter(
      (budget): budget is { category: string; limit: number } =>
        typeof budget.category === 'string' &&
        budget.category.trim().length > 0 &&
        typeof budget.limit === 'number' &&
        budget.limit > 0
    );

    if (validBudgets.length === 0) {
      return '请告诉我预算金额，比如"设置餐饮预算 3000"。';
    }

    const toolCheck = canCallTool(AGENT_ID, 'set_budget');
    if (!toolCheck.allowed) {
      return `操作被拒绝：${toolCheck.reason}`;
    }

    const successes: { category: string; limit: number }[] = [];
    const failures: string[] = [];
    for (const budget of validBudgets) {
      const result = await set_budget({ category: budget.category, limit: budget.limit });
      if (result.success) {
        successes.push(budget);
        await rememberThis(AGENT_ID, `预算:${budget.category}=¥${budget.limit.toFixed(0)}/月`);
      } else {
        failures.push(`${budget.category}: ${result.error}`);
      }
    }

    if (successes.length > 0) {
      await rememberMoment(AGENT_ID, `批量预算:${successes.map(b => `${b.category}=¥${b.limit}`).join('|')}`);
      let reply = `✅ 已设定 ${successes.length} 个预算：\n`;
      for (const budget of successes) {
        reply += `${budget.category}：¥${budget.limit.toFixed(2)}/月\n`;
      }
      if (failures.length > 0) {
        reply += `\n部分预算设置失败：${failures.join('；')}`;
      }
      return reply.trim();
    }

    return `设置预算失败：${failures.join('；')}`;
  }

  const category = (params.category as string) || '餐饮';
  const limit = params.limit as number;

  if (!limit || limit <= 0) {
    return '请告诉我预算金额，比如"设置餐饮预算 3000"。';
  }

  const toolCheck = canCallTool(AGENT_ID, 'set_budget');
  if (!toolCheck.allowed) {
    return `操作被拒绝：${toolCheck.reason}`;
  }

  const result = await set_budget({ category, limit });

  if (result.success) {
    await rememberThis(AGENT_ID, `预算:${category}=¥${limit.toFixed(0)}/月`);
    return `✅ 已设定 ${category} 月度预算：¥${limit.toFixed(2)}\n\n我会帮您跟踪执行情况，超标时会主动提醒。`;
  }
  return `设置预算失败：${result.error}`;
}

async function handleCreateSavingsGoal(params: Record<string, unknown>): Promise<string> {
  const name = (params.name as string) || '储蓄目标';
  const targetAmount = params.targetAmount as number;

  if (!targetAmount || targetAmount <= 0) {
    return '请告诉我目标金额，比如"创建储蓄目标 旅行的 50000"。';
  }

  const result = await create_savings_goal({
    name,
    targetAmount,
    deadline: params.deadline as string,
  });

  if (result.success) {
    return `🎯 已创建储蓄目标「${name}」¥${targetAmount.toFixed(2)}\n\n为达成目标，建议每月存 ¥${(targetAmount / 12).toFixed(0)}。加油！💪`;
  }
  return `创建储蓄目标失败：${result.error}`;
}

async function handleGetSavings(params: Record<string, unknown>): Promise<string> {
  const result = await get_savings_progress({
    goalId: params.goalId as string,
  });

  if (!result.success || !result.data) {
    return `查询储蓄进度失败：${result.error}`;
  }

  const goals = result.data as {
    id: string;
    name: string;
    targetAmount: number;
    currentAmount: number;
    deadline: string;
    createdAt: string;
  }[];

  if (goals.length === 0) {
    return '您还没有储蓄目标。说"创建储蓄目标"来开始吧！';
  }

  let reply = '🎯 **储蓄进度**\n\n';
  for (const g of goals) {
    const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
    const barDone = '█'.repeat(Math.min(Math.ceil(pct / 10), 10));
    const barLeft = '░'.repeat(Math.max(0, 10 - Math.ceil(pct / 10)));
    reply += `📌 ${g.name}\n`;
    reply += `   ¥${g.currentAmount.toFixed(0)} / ¥${g.targetAmount.toFixed(0)} [${barDone}${barLeft}] ${pct}%\n`;
    if (g.deadline) {
      const remaining = Math.max(0, Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000));
      reply += `   ⏰ 剩余 ${remaining} 天\n`;
    }
    reply += '\n';
  }

  return reply;
}

async function handleGetAdvice(params: Record<string, unknown>): Promise<string> {
  const result = await get_budget_status({});

  let reply = '💡 **理财建议**\n\n';

  if (result.success && result.data) {
    const statuses = result.data as {
      category: string;
      limit: number;
      spent: number;
      remaining: number;
      percentUsed: number;
    }[];

    if (statuses.length > 0) {
      const overBudget = statuses.filter(s => s.percentUsed >= 80);
      const healthy = statuses.filter(s => s.percentUsed < 80);

      if (overBudget.length > 0) {
        reply += '⚠️ 预算预警：\n';
        for (const s of overBudget) {
          reply += `  • ${s.category} 已消耗 ${s.percentUsed}%，剩余 ¥${s.remaining.toFixed(0)}\n`;
        }
        reply += '\n';
      }

      if (healthy.length > 0) {
        reply += `✅ ${healthy.length} 个分类预算执行良好\n\n`;
      }
    }
  }

  reply += '💡 通用建议：\n';
  reply += '• 尝试 50/30/20 法则：50% 必要支出，30% 可选支出，20% 储蓄\n';
  reply += '• 每周回顾一次消费记录\n';
  reply += '• 设置小目标比大目标更容易坚持\n';
  reply += '• 记录每一笔支出，关注"拿铁因子"\n';

  return reply;
}

async function handleGetStreak(): Promise<string> {
  const result = await get_streak_info();

  if (!result.success || !result.data) {
    return `查询打卡信息失败：${result.error}`;
  }

  const data = result.data as {
    currentStreak: number;
    longestStreak: number;
    totalDays: number;
    lastRecordDate: string;
  };

  let reply = '🔥 **记账打卡**\n\n';
  reply += `📅 当前连续：${data.currentStreak} 天\n`;
  reply += `🏆 最长记录：${data.longestStreak} 天\n`;
  reply += `📊 累计记账：${data.totalDays} 天\n`;

  if (data.currentStreak >= 7) {
    reply += '\n🎉 太厉害了！你已经连续记账超过一周了！';
  } else if (data.currentStreak > 0) {
    reply += '\n💪 继续保持！连续 7 天就能解锁成就！';
  } else {
    reply += '\n📝 今天还没记账哦，快来记一笔吧！';
  }

  return reply;
}

async function handleGetAchievements(params: Record<string, unknown>): Promise<string> {
  const result = await get_achievement({
    achievementId: params.achievementId as string,
  });

  if (!result.success || !result.data) {
    return `查询成就失败：${result.error}`;
  }

  const achievements = result.data as {
    id: string;
    name: string;
    description: string;
    unlocked: boolean;
    progress: number;
    maxProgress: number;
    unlockedAt: string;
  }[];

  if (achievements.length === 0) {
    return '暂无成就数据。';
  }

  let reply = '🏆 **成就展示**\n\n';
  const unlocked = achievements.filter(a => a.unlocked);
  const locked = achievements.filter(a => !a.unlocked);

  if (unlocked.length > 0) {
    reply += '✅ 已解锁：\n';
    for (const a of unlocked) {
      reply += `  🏅 ${a.name}：${a.description}\n`;
    }
    reply += '\n';
  }

  if (locked.length > 0) {
    reply += '🔒 未解锁：\n';
    for (const a of locked.slice(0, 5)) {
      const pct = a.maxProgress > 0 ? Math.round((a.progress / a.maxProgress) * 100) : 0;
      reply += `  ⬜ ${a.name}：${a.description} (${pct}%)\n`;
    }
  }

  return reply;
}

async function handleGreeting(): Promise<string> {
  const streakResult = await get_streak_info();

  const streak = streakResult.success ? streakResult.data as {
    currentStreak: number;
    longestStreak: number;
    totalDays: number;
  } : null;

  await rememberMoment(AGENT_ID, `问候|连续${streak?.currentStreak || 0}天`);

  let reply = '您好！我是您的理财教练 💪\n\n';

  if (streak) {
    reply += `🔥 已连续记账 ${streak.currentStreak} 天\n`;
  }

  reply += '\n我可以帮您：\n';
  reply += '📊 设置和管理预算\n';
  reply += '🎯 创建储蓄目标\n';
  reply += '🏆 查看成就和打卡\n';
  reply += '💡 获取理财建议\n';
  reply += '\n试试说"设置预算"或"查看成就"吧！';

  return reply;
}

async function handleProactiveCheck(): Promise<string> {
  const result = await run_proactive_check();

  if (!result.success) {
    return `主动检查失败：${result.error}`;
  }

  const findings = result.data as {
    budgetAlerts: { category: string; severity: string; message: string }[];
    inactivityAlert: { daysSinceLastRecord: number; shouldNotify: boolean } | null;
    upcomingAchievements: { name: string; progress: number; maxProgress: number; percent: number }[];
    savingsUpdates: { name: string; percent: number; onTrack: boolean }[];
    insights: string[];
  };

  let reply = '🔍 **AI 主动检查报告**\n\n';

  if (findings.budgetAlerts.length > 0) {
    reply += '⚠️ **预算预警**\n';
    for (const alert of findings.budgetAlerts) {
      reply += `  ${alert.message}\n`;
    }
    reply += '\n';
  } else {
    reply += '✅ 所有预算执行良好\n\n';
  }

  if (findings.inactivityAlert && findings.inactivityAlert.shouldNotify) {
    reply += `⏰ 你已经 ${findings.inactivityAlert.daysSinceLastRecord} 天没有记账了\n\n`;
  }

  if (findings.upcomingAchievements.length > 0) {
    reply += '🏆 **即将达成**\n';
    for (const ach of findings.upcomingAchievements) {
      reply += `  ${ach.name}：进度 ${ach.percent}%\n`;
    }
    reply += '\n';
  }

  if (findings.savingsUpdates.length > 0) {
    reply += '🎯 **储蓄进度**\n';
    for (const s of findings.savingsUpdates) {
      const status = s.onTrack ? '✅ 正常' : '⚠️ 落后';
      reply += `  ${s.name}：${s.percent}% ${status}\n`;
    }
    reply += '\n';
  }

  if (findings.insights.length > 0) {
    reply += '💡 **智能洞察**\n';
    for (const insight of findings.insights) {
      reply += `  ${insight}\n`;
    }
  }

  await rememberMoment(AGENT_ID, `主动检查|预算:${findings.budgetAlerts.length}个预警`);

  return reply;
}

async function handleProactiveInsights(): Promise<string> {
  const result = await get_proactive_insights();

  if (!result.success) {
    return `获取洞察失败：${result.error}`;
  }

  const { insights } = result.data as { insights: string[] };

  let reply = '💡 **智能洞察**\n\n';
  for (const insight of insights) {
    reply += `  ${insight}\n`;
  }

  return reply;
}

async function handleTodaySummary(): Promise<string> {
  const result = await get_today_summary();

  if (!result.success) {
    return `获取概览失败：${result.error}`;
  }

  const summary = result.data as {
    today: { income: number; expense: number; count: number };
    month: { income: number; expense: number; count: number };
    budgetStatus: { category: string; percentUsed: number; remaining: number }[];
  };

  let reply = `📊 **今日概览** (${new Date().toLocaleDateString('zh-CN')})\n\n`;

  reply += '📅 今日：\n';
  reply += `  收入：¥${summary.today.income.toFixed(2)}\n`;
  reply += `  支出：¥${summary.today.expense.toFixed(2)}\n`;
  reply += `  记录：${summary.today.count} 笔\n\n`;

  reply += '📆 本月：\n';
  reply += `  收入：¥${summary.month.income.toFixed(2)}\n`;
  reply += `  支出：¥${summary.month.expense.toFixed(2)}\n`;
  reply += `  记录：${summary.month.count} 笔\n`;

  if (summary.budgetStatus.length > 0) {
    reply += '\n⚡ 预算关注：\n';
    for (const bs of summary.budgetStatus) {
      reply += `  ${bs.category}：${bs.percentUsed}% (剩余 ¥${bs.remaining.toFixed(0)})\n`;
    }
  }

  return reply;
}

async function handleSetupReminder(params: Record<string, unknown>): Promise<string> {
  const hour = (params.hour as number) || 20;
  const minute = (params.minute as number) || 0;

  const toolCheck = canCallTool(AGENT_ID, 'schedule_daily_reminder');
  if (!toolCheck.allowed) {
    return `操作被拒绝：${toolCheck.reason}`;
  }

  const tool = getTool('schedule_daily_reminder');
  if (!tool) return '提醒功能暂不可用。';

  const result = await tool.handler({
    title: '📝 记账提醒',
    body: '今天还没记账哦！花几分钟记录一下今天的收支吧～',
    hour,
    minute,
  });

  if (result.success) {
    const time = `${hour}:${String(minute).padStart(2, '0')}`;
    return `✅ 已设置每日 ${time} 的记账提醒\n\n之后每天这个时间我会提醒你记账！`;
  }

  return `设置提醒失败：${result.error}`;
}

async function handleListTags(_params: Record<string, unknown>): Promise<string> {
  const tool = getTool('list_tags');
  if (!tool) return '标签功能暂不可用。';
  const result = await tool.handler({});
  if (!result.success || !result.data) return '暂无标签。';
  const tags = result.data as { name: string; color: string; billCount: number }[];
  if (!Array.isArray(tags) || tags.length === 0) return '暂无标签，你可以说"添加标签 必须买"。';
  let reply = '标签列表：\n';
  for (const t of tags) {
    reply += `${t.name} (${t.billCount}条) `;
  }
  return reply;
}

async function handleShareBills(_params: Record<string, unknown>): Promise<string> {
  const tool = getTool('create_link');
  if (!tool) return '分享功能暂不可用。';
  const result = await tool.handler({});
  if (result.success && result.data) {
    const data = result.data as { summary: { billCount: number; totalExpense: number } };
    return `已生成分享链接!\n包含 ${data.summary.billCount} 条账单，总支出 ¥${data.summary.totalExpense}`;
  }
  return `创建分享失败: ${result.error}`;
}

async function handleLevelStatus(_params: Record<string, unknown>): Promise<string> {
  const levelTool = getTool('get_level');
  const challengeTool = getTool('get_challenges');

  let reply = '';

  if (levelTool) {
    const result = await levelTool.handler();
    if (result.success && result.data) {
      const data = result.data as { level: number; title: string; experience: number; nextLevelExperience: number; progress: number };
      const bar = '█'.repeat(Math.round(data.progress * 10)) + '░'.repeat(10 - Math.round(data.progress * 10));
      reply += `等级 ${data.level} - ${data.title}\n`;
      reply += `经验 ${data.experience}/${data.nextLevelExperience} [${bar}]\n\n`;
    }
  }

  if (challengeTool) {
    const result = await challengeTool.handler();
    if (result.success && result.data) {
      const challenges = result.data as { title: string; completed: boolean; reward: string }[];
      reply += '当前挑战:\n';
      for (const c of challenges) {
        reply += `${c.completed ? '✅' : '⭕'} ${c.title} (${c.reward})\n`;
      }
    }
  }

  return reply || '等级信息暂不可用。';
}
