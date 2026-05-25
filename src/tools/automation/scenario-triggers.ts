import { NotificationScenario, NotificationScenarioType, ToolResult } from '../../shared/types';
import { getDatabase } from '../../core/database/database';
import { captureError } from '../../core/logger/logger';
import { check_budget_overrun } from '../budget/budget.tool';
import { get_streak_info, get_achievement } from '../gamification/gamification.tool';
import { schedule_local_notification } from './automation.tool';
import { getNotificationPermissionStatus } from '../../core/notifications/notification.service';

export async function evaluate_all_scenarios(): Promise<ToolResult> {
  const scenarios: NotificationScenario[] = [];

  try {
    const [bookkeeping, budget, inactive, achievements] = await Promise.all([
      evaluateBookkeepingReminder(),
      evaluateBudgetOverrun(),
      evaluateInactivityAlert(),
      evaluateAchievementUnlock(),
    ]);

    if (bookkeeping) scenarios.push(bookkeeping);
    if (budget.length > 0) scenarios.push(...budget);
    if (inactive) scenarios.push(inactive);
    if (achievements.length > 0) scenarios.push(...achievements);

    const triggered = scenarios.filter(s => s.shouldTrigger);
    const notifications: { scheduled: boolean; scenario: string }[] = [];

    for (const scenario of triggered) {
      const now = new Date();
      let triggerAt = new Date(now.getTime() + 10 * 1000).toISOString();

      if (scenario.type === 'bookkeeping_reminder') {
        const hour = 20;
        const trigger = new Date(now);
        trigger.setHours(hour, 0, 0, 0);
        if (trigger.getTime() <= now.getTime()) {
          trigger.setDate(trigger.getDate() + 1);
        }
        triggerAt = trigger.toISOString();
      }

      try {
        await schedule_local_notification({
          title: scenario.title,
          body: scenario.body,
          triggerAt,
          data: { scenarioType: scenario.type, ...scenario.data },
        });
        notifications.push({ scheduled: true, scenario: scenario.type });
      } catch {
        notifications.push({ scheduled: false, scenario: scenario.type });
      }
    }

    return {
      success: true,
      data: { scenarios, triggered: triggered.length, notifications },
    };
  } catch (e) {
    captureError('ScenarioTriggers.evaluate_all', e, 'Evaluate scenarios failed');
    return { success: false, error: '场景评估失败', errorCode: '1000' };
  }
}

async function evaluateBookkeepingReminder(): Promise<NotificationScenario | null> {
  try {
    const db = await getDatabase();
    const today = new Date().toISOString().split('T')[0];

    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM bills WHERE date = ?',
      [today]
    );

    const hasRecorded = (result?.count || 0) > 0;

    return {
      type: 'bookkeeping_reminder',
      title: '📝 记账提醒',
      body: hasRecorded
        ? '今天已经记过账了，做得很好！记得查看预算情况～'
        : '今天还没记账哦！花几分钟记录一下今天的收支吧～',
      priority: hasRecorded ? 'normal' : 'high',
      shouldTrigger: !hasRecorded,
      data: { hasRecorded },
    };
  } catch (e) {
    captureError('ScenarioTriggers.evaluateBookkeeping', e, 'Bookkeeping check failed');
    return null;
  }
}

async function evaluateBudgetOverrun(): Promise<NotificationScenario[]> {
  const scenarios: NotificationScenario[] = [];

  try {
    const result = await check_budget_overrun({});
    if (!result.success || !result.data) return scenarios;

    const { alerts } = result.data as { alerts: { category: string; severity: string; percentUsed: number; message: string }[] };

    for (const alert of alerts) {
      const scenarioType: NotificationScenarioType = 'budget_overrun';

      scenarios.push({
        type: scenarioType,
        title: alert.severity === 'overrun' ? '🚨 预算超标警告' : '⚡ 预算预警',
        body: alert.message,
        priority: alert.severity === 'overrun' ? 'critical' : 'high',
        shouldTrigger: true,
        data: { category: alert.category, percentUsed: alert.percentUsed },
      });
    }

    return scenarios;
  } catch (e) {
    captureError('ScenarioTriggers.evaluateBudgetOverrun', e, 'Budget overrun check failed');
    return scenarios;
  }
}

async function evaluateInactivityAlert(): Promise<NotificationScenario | null> {
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
      daysSinceLastRecord = Math.floor((now.getTime() - lastDate.getTime()) / 86400000);
    }

    const shouldTrigger = daysSinceLastRecord >= 3;

    return {
      type: 'inactive_3days',
      title: '⏰ 好久不见！',
      body:
        lastRecordDate
          ? `你已经 ${daysSinceLastRecord} 天没有记账了，快来补上吧～`
          : '欢迎回来！开始记录你的第一笔账单吧～',
      priority: daysSinceLastRecord >= 7 ? 'critical' : 'high',
      shouldTrigger,
      data: { daysSinceLastRecord, lastRecordDate },
    };
  } catch (e) {
    captureError('ScenarioTriggers.evaluateInactivity', e, 'Inactivity check failed');
    return null;
  }
}

async function evaluateAchievementUnlock(): Promise<NotificationScenario[]> {
  const scenarios: NotificationScenario[] = [];

  try {
    const result = await get_achievement({});
    if (!result.success || !result.data) return scenarios;

    const achievements = result.data as {
      name: string;
      unlocked: boolean;
      progress: number;
      maxProgress: number;
    }[];

    for (const ach of achievements) {
      const percent = ach.maxProgress > 0 ? Math.round((ach.progress / ach.maxProgress) * 100) : 0;

      if (ach.progress >= ach.maxProgress && !ach.unlocked) {
        scenarios.push({
          type: 'achievement_unlock',
          title: '🎉 成就解锁！',
          body: `恭喜你达成成就「${ach.name}」！继续加油！`,
          priority: 'normal',
          shouldTrigger: true,
          data: { achievementName: ach.name },
        });
      } else if (percent >= 90) {
        scenarios.push({
          type: 'achievement_unlock',
          title: '🏆 即将达成',
          body: `成就不远了！「${ach.name}」进度 ${percent}%，再加把劲！`,
          priority: 'normal',
          shouldTrigger: false,
          data: { achievementName: ach.name, percent },
        });
      }
    }

    return scenarios;
  } catch (e) {
    captureError('ScenarioTriggers.evaluateAchievements', e, 'Achievement check failed');
    return scenarios;
  }
}

export async function trigger_backup_failure_notification(errorDetail: string): Promise<boolean> {
  try {
    await schedule_local_notification({
      title: '⚠️ 备份失败',
      body: `数据备份出现问题：${errorDetail}。请检查网络连接后重试。`,
      triggerAt: new Date(Date.now() + 5000).toISOString(),
      data: { scenarioType: 'backup_failure' as NotificationScenarioType },
    });
    return true;
  } catch {
    return false;
  }
}
