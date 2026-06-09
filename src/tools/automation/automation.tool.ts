import { v4 as uuidv4 } from 'uuid';
import { captureError } from '../../core/logger/logger';
import { getDatabase } from '../../core/database/database';
import { ToolResult, ShortcutRecord, RecurringTask } from '../../shared/types';
import {
  scheduleNotification,
  scheduleDailyNotification,
  cancelAllNotifications,
  getNotificationPermissionStatus as getPermStatus,
} from '../../core/notifications/notification.service';

export async function create_recurring_task(params: {
  name: string;
  type: 'reminder' | 'backup' | 'report';
  cron: string;
}): Promise<ToolResult> {
  if (!params.name || !params.type || !params.cron) {
    return { success: false, error: '请输入有效的任务名称、类型和调度规则', errorCode: '1002' };
  }

  const db = await getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  try {
    await db.runAsync(
      `INSERT INTO recurring_tasks (id, name, type, cron, enabled, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [id, params.name, params.type, params.cron, now]
    );

    const task = await db.getFirstAsync<RecurringTask>(
      'SELECT * FROM recurring_tasks WHERE id = ?',
      [id]
    );

    return { success: true, data: task };
  } catch (e) {
    captureError('AutomationTool.create_recurring_task', e, 'Create recurring task failed');
    return { success: false, error: '创建周期任务失败', errorCode: '1000' };
  }
}

export async function get_recurring_tasks(params?: {
  type?: string;
}): Promise<ToolResult> {
  const db = await getDatabase();

  try {
    if (params?.type) {
      const tasks = await db.getAllAsync<RecurringTask>(
        'SELECT * FROM recurring_tasks WHERE type = ? ORDER BY created_at DESC',
        [params.type]
      );
      return { success: true, data: tasks };
    }

    const tasks = await db.getAllAsync<RecurringTask>(
      'SELECT * FROM recurring_tasks ORDER BY created_at DESC'
    );
    return { success: true, data: tasks };
  } catch (e) {
    captureError('AutomationTool.get_recurring_tasks', e, 'Get recurring tasks failed');
    return { success: false, error: '查询周期任务失败', errorCode: '1000' };
  }
}

export async function delete_recurring_task(params: {
  taskId: string;
}): Promise<ToolResult> {
  if (!params.taskId) {
    return { success: false, error: '请指定要删除的任务', errorCode: '1002' };
  }

  const db = await getDatabase();

  try {
    const result = await db.runAsync(
      'DELETE FROM recurring_tasks WHERE id = ?',
      [params.taskId]
    );
    if (result.changes === 0) {
      return { success: false, error: '周期任务不存在' };
    }
    return { success: true, data: { deletedId: params.taskId } };
  } catch (e) {
    captureError('AutomationTool.delete_recurring_task', e, 'Delete recurring task failed');
    return { success: false, error: '删除周期任务失败', errorCode: '1000' };
  }
}

export async function register_shortcut(params: {
  name: string;
  action: string;
  icon?: string;
}): Promise<ToolResult> {
  if (!params.name || !params.action) {
    return { success: false, error: '请输入有效的快捷指令名称和动作', errorCode: '1002' };
  }

  try {
    const db = await getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO shortcuts (id, name, action, icon, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, params.name, params.action, params.icon || '⚡', now]
    );

    return {
      success: true,
      data: {
        id,
        name: params.name,
        action: params.action,
        icon: params.icon || '⚡',
        registered: true,
        registeredAt: now,
      },
    };
  } catch (e) {
    captureError('AutomationTool.register_shortcut', e, 'Register shortcut failed');
    return { success: false, error: '注册快捷指令失败', errorCode: '1000' };
  }
}

export async function get_shortcuts(): Promise<ToolResult> {
  const db = await getDatabase();

  try {
    const shortcuts = await db.getAllAsync<ShortcutRecord>(
      'SELECT * FROM shortcuts ORDER BY created_at DESC'
    );
    return { success: true, data: shortcuts };
  } catch {
    return { success: true, data: [] };
  }
}

export async function schedule_local_notification(params: {
  title: string;
  body: string;
  triggerAt: string;
  channelId?: string;
  data?: Record<string, unknown>;
}): Promise<ToolResult> {
  if (!params.title || !params.body || !params.triggerAt) {
    return { success: false, error: '请提供通知标题、内容和触发时间', errorCode: '1002' };
  }

  if (new Date(params.triggerAt).getTime() < Date.now()) {
    return { success: false, error: '触发时间不能是过去的时间', errorCode: '1002' };
  }

  try {
    const result = await scheduleNotification({
      title: params.title,
      body: params.body,
      triggerAt: params.triggerAt,
      channelId: params.channelId,
      data: params.data,
    });

    if (result.scheduled) {
      return {
        success: true,
        data: {
          scheduled: true,
          notificationId: result.notificationId,
          notification: {
            title: params.title,
            body: params.body,
            triggerAt: params.triggerAt,
          },
        },
      };
    }

    return { success: false, error: '通知调度失败', errorCode: '1000' };
  } catch (e) {
    captureError('AutomationTool.schedule_local_notification', e, 'Schedule notification failed');
    return { success: false, error: '调度通知时出错', errorCode: '1000' };
  }
}

export async function get_notification_permission_status(): Promise<ToolResult> {
  try {
    const status = await getPermStatus();
    return { success: true, data: status };
  } catch {
    return {
      success: true,
      data: { permission: 'unknown', canSchedule: false },
    };
  }
}

export async function schedule_daily_reminder(params: {
  title: string;
  body: string;
  hour: number;
  minute: number;
}): Promise<ToolResult> {
  if (!params.title || !params.body) {
    return { success: false, error: '请提供通知标题和内容', errorCode: '1002' };
  }

  if (params.hour < 0 || params.hour > 23 || params.minute < 0 || params.minute > 59) {
    return { success: false, error: '时间参数无效', errorCode: '1002' };
  }

  try {
    const result = await scheduleDailyNotification({
      title: params.title,
      body: params.body,
      hour: params.hour,
      minute: params.minute,
      channelId: 'wealth-manager-reminders',
    });

    if (result.scheduled) {
      return {
        success: true,
        data: {
          scheduled: true,
          notificationId: result.notificationId,
          schedule: `每天 ${params.hour}:${String(params.minute).padStart(2, '0')}`,
        },
      };
    }

    return { success: false, error: '每日提醒调度失败', errorCode: '1000' };
  } catch (e) {
    captureError('AutomationTool.schedule_daily_reminder', e, 'Schedule daily failed');
    return { success: false, error: '调度每日提醒时出错', errorCode: '1000' };
  }
}

export async function cancel_all_notifications(): Promise<ToolResult> {
  try {
    await cancelAllNotifications();
    return { success: true, data: { cancelled: true } };
  } catch (e) {
    captureError('AutomationTool.cancel_all_notifications', e, 'Cancel all failed');
    return { success: false, error: '取消通知失败', errorCode: '1000' };
  }
}
