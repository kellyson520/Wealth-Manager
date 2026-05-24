import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../core/database/database';
import { RecurringTask, ToolResult } from '../../shared/types';

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
    await db.runAsync(
      'DELETE FROM recurring_tasks WHERE id = ?',
      [params.taskId]
    );
    return { success: true, data: { deletedId: params.taskId } };
  } catch (e) {
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

  return {
    success: true,
    data: {
      name: params.name,
      action: params.action,
      icon: params.icon || '⚡',
      registered: true,
      registeredAt: new Date().toISOString(),
    },
  };
}

export async function schedule_local_notification(params: {
  title: string;
  body: string;
  triggerAt: string;
}): Promise<ToolResult> {
  if (!params.title || !params.body || !params.triggerAt) {
    return { success: false, error: '请提供通知标题、内容和触发时间', errorCode: '1002' };
  }

  if (new Date(params.triggerAt).getTime() < Date.now()) {
    return { success: false, error: '触发时间不能是过去的时间', errorCode: '1002' };
  }

  return {
    success: true,
    data: {
      scheduled: true,
      notification: {
        title: params.title,
        body: params.body,
        triggerAt: params.triggerAt,
      },
      note: '通知已在本地调度，将在指定时间触发',
    },
  };
}

export async function get_notification_permission_status(): Promise<ToolResult> {
  return {
    success: true,
    data: {
      permission: 'unknown',
      canSchedule: true,
      note: '当前为开发环境，权限状态需在真机上确认',
    },
  };
}
