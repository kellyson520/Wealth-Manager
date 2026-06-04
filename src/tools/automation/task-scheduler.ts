import { getDatabase } from '../../core/database/database';
import { captureError } from '../../core/logger/logger';
import { RecurringTask, ToolResult } from '../../shared/types';
import { evaluate_all_scenarios } from './scenario-triggers';
import { v4 as uuidv4 } from 'uuid';

export async function run_all_scheduled_tasks(): Promise<ToolResult> {
  const db = await getDatabase();

  try {
    const tasks = await db.getAllAsync<RecurringTask>(
      "SELECT * FROM recurring_tasks WHERE enabled = 1"
    );

    const now = new Date();
    const executed: string[] = [];
    const skipped: string[] = [];

    for (const task of tasks) {
      if (!shouldExecuteNow(task, now)) {
        skipped.push(task.id);
        continue;
      }

      try {
        await executeTask(task);
        await db.runAsync(
          'UPDATE recurring_tasks SET last_triggered = ? WHERE id = ?',
          [now.toISOString(), task.id]
        );
        executed.push(task.id);
      } catch (e) {
        captureError('TaskScheduler.execute', e, `Failed task ${task.id}`);
      }
    }

    return {
      success: true,
      data: {
        executed: executed.length,
        skipped: skipped.length,
        total: tasks.length,
        executedTaskIds: executed,
      },
    };
  } catch (e) {
    captureError('TaskScheduler.run_all', e, 'Run scheduled tasks failed');
    return { success: false, error: '执行计划任务失败', errorCode: '1000' };
  }
}

function shouldExecuteNow(task: RecurringTask, now: Date): boolean {
  if (!task.enabled) return false;

  if (!task.lastTriggered) return true;

  const lastTrigger = new Date(task.lastTriggered);
  const cronParts = task.cron.split(/\s+/);

  if (cronParts.length !== 5) {
    const minutesDiff = (now.getTime() - lastTrigger.getTime()) / 60000;
    return minutesDiff >= 60;
  }

  const [minute, hour] = cronParts;

  const nowMinute = now.getMinutes();
  const nowHour = now.getHours();
  let minuteMatch = false;
  if (minute === '*') {
    minuteMatch = true;
  } else if (minute.includes('/')) {
    const interval = parseInt(minute.split('/')[1]);
    minuteMatch = nowMinute % interval === 0;
  } else {
    minuteMatch = parseInt(minute) === nowMinute;
  }

  let hourMatch = false;
  if (hour === '*') {
    hourMatch = true;
  } else {
    hourMatch = parseInt(hour) === nowHour;
  }

  if (!minuteMatch || !hourMatch) return false;

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastTriggerDate = new Date(lastTrigger.getFullYear(), lastTrigger.getMonth(), lastTrigger.getDate());

  return lastTriggerDate.getTime() < todayStart.getTime();
}

async function executeTask(task: RecurringTask): Promise<void> {
  switch (task.type) {
    case 'reminder':
      await evaluate_all_scenarios();
      break;
    case 'report':
      break;
    case 'backup':
      break;
    default:
      break;
  }
}

export async function schedule_default_reminders(): Promise<ToolResult> {
  try {
    const results: { name: string; scheduled: boolean }[] = [];

    const bookkeepingResult = await createDefaultBookkeepingReminder();
    results.push({ name: '记账提醒', scheduled: bookkeepingResult });

    const inactivityResult = await createDefaultInactivityCheck();
    results.push({ name: '长时间未记录提醒', scheduled: inactivityResult });

    return {
      success: true,
      data: {
        message: `已配置 ${results.filter(r => r.scheduled).length}/${results.length} 个默认提醒`,
        results,
      },
    };
  } catch (e) {
    captureError('TaskScheduler.schedule_defaults', e, 'Schedule defaults failed');
    return { success: false, error: '配置默认提醒失败', errorCode: '1000' };
  }
}

async function createDefaultBookkeepingReminder(): Promise<boolean> {
  try {
    const db = await getDatabase();
    const existing = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM recurring_tasks WHERE type = 'reminder' AND name = '每日记账提醒'"
    );

    if (existing && existing.count > 0) return true;

    await db.runAsync(
      `INSERT INTO recurring_tasks (id, name, type, cron, enabled, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [uuidv4(), '每日记账提醒', 'reminder', '0 20 * * *', new Date().toISOString()]
    );
    return true;
  } catch {
    return false;
  }
}

async function createDefaultInactivityCheck(): Promise<boolean> {
  try {
    const db = await getDatabase();
    const existing = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM recurring_tasks WHERE type = 'reminder' AND name = '长时间未记录检查'"
    );

    if (existing && existing.count > 0) return true;

    await db.runAsync(
      `INSERT INTO recurring_tasks (id, name, type, cron, enabled, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [uuidv4(), '长时间未记录检查', 'reminder', '0 10 * * *', new Date().toISOString()]
    );
    return true;
  } catch {
    return false;
  }
}
