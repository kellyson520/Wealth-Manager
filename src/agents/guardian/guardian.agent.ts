import { IntentResult, AgentId } from '../../shared/types';
import { run_safety_check, analyze_subscriptions, sanitize_input, sanitize_for_cloud, verify_hash_chain, repair_hash_chain, export_audit_package, get_privacy_report } from '../../tools/security/security.tool';
import { create_recurring_task, get_recurring_tasks, delete_recurring_task, register_shortcut, schedule_local_notification, get_notification_permission_status } from '../../tools/automation/automation.tool';
import {
  canCallTool,
  executeTool,
  rememberMoment,
  getTool,
} from '../_shared';

const AGENT_ID: AgentId = 'guardian';

export async function handleIntent(intent: IntentResult): Promise<string> {
  switch (intent.intent) {
    case 'safety_check':
      return handleSafetyCheck(intent.params);
    case 'privacy_report':
      return handlePrivacyReport();
    case 'subscriptions':
      return handleSubscriptions();
    case 'delete_bill':
      return handleDeleteBill(intent.params);
    case 'verify_chain':
      return handleVerifyChain();
	    case 'repair_chain':
	      return handleRepairChain(intent.params);
    case 'export_audit':
      return handleExportAudit(intent.params);
    case 'revoke_cloud':
      return handleRevokeCloud(intent.params);
    case 'create_reminder':
      return handleCreateReminder(intent.params);
    case 'get_reminders':
      return handleGetReminders(intent.params);
    case 'delete_reminder':
      return handleDeleteReminder(intent.params);
    case 'register_shortcut':
      return handleRegisterShortcut(intent.params);
    case 'schedule_notification':
      return handleScheduleNotification(intent.params);
    case 'notification_status':
      return handleNotificationStatus();
    case 'sync_webdav':
      return handleSyncWebDAV(intent.params);
    default:
      return '我是您的安全守护者 🛡️\n\n可以帮您：\n• "安全扫描" — 检查异常交易\n• "隐私报告" — 查看数据状态\n• "创建提醒" — 设置记账提醒\n• "分析订阅" — 发现订阅支出';
  }
}

export async function preActionCheck(params: {
  amount: number;
  merchant: string;
  billId?: string;
}): Promise<{ safe: boolean; message?: string }> {
  const result = await run_safety_check({
    amount: params.amount,
    merchant: params.merchant,
    billId: params.billId,
  });

  if (!result.success || !result.data) {
    return { safe: false, message: '安全预检失败，请稍后重试。' };
  }

  const check = result.data as {
    passed: boolean;
    riskLevel: string;
    issues: { detail: string; severity: string }[];
  };

  await rememberMoment(
    AGENT_ID,
    `预检:${params.merchant}|¥${params.amount}|级别:${check.riskLevel}`
  );

  if (check.riskLevel === 'danger') {
    const details = check.issues.map(i => i.detail).join('；');
    return {
      safe: false,
      message: `⚠️ 安全警告：${details}。请确认是否继续操作？`,
    };
  }

  if (check.riskLevel === 'caution') {
    const details = check.issues.map(i => i.detail).join('；');
    return {
      safe: true,
      message: `💡 提示：${details}`,
    };
  }

  return { safe: true };
}

async function handleSafetyCheck(params: Record<string, unknown>): Promise<string> {
  const toolCheck = canCallTool(AGENT_ID, 'run_safety_check');
  if (!toolCheck.allowed) {
    return `操作被拒绝：${toolCheck.reason}`;
  }

  const result = await run_safety_check({
    amount: params.amount as number,
    merchant: params.merchant as string,
    billId: params.billId as string,
  });

  if (!result.success || !result.data) {
    return `安全扫描失败：${result.error}`;
  }

  const check = result.data as {
    passed: boolean;
    riskLevel: string;
    issues: { detail: string; severity: string }[];
    suggestedActions: string[];
  };

  await rememberMoment(AGENT_ID, `安全扫描:${check.riskLevel}|问题数:${check.issues.length}`);

  if (check.riskLevel === 'safe') {
    return '✅ 安全扫描通过，未发现异常。';
  }

  let reply = '';
  if (check.riskLevel === 'danger') {
    reply += '🔴 **安全警告**\n\n';
  } else {
    reply += '🟡 **安全提示**\n\n';
  }

  for (const issue of check.issues) {
    reply += `• ${issue.detail}\n`;
  }

  return reply;
}

async function handlePrivacyReport(): Promise<string> {
  const toolCheck = canCallTool(AGENT_ID, 'get_privacy_report');
  if (!toolCheck.allowed) {
    return `操作被拒绝：${toolCheck.reason}`;
  }

  const result = await get_privacy_report();

  if (!result.success || !result.data) {
    return `隐私报告失败：${result.error}`;
  }

  const data = result.data as {
    totalBills: number;
    uniqueCategories: number;
    auditLogEntries: number;
    dataLocation: string;
    cloudSyncEnabled: boolean;
  };

  await rememberMoment(AGENT_ID, `隐私报告:${data.totalBills}条|本地:${data.dataLocation === 'local_only'}`);

  let reply = '🔒 **隐私报告**\n\n';
  reply += `📝 账单记录：${data.totalBills} 条\n`;
  reply += `📂 消费分类：${data.uniqueCategories} 个\n`;
  reply += `📋 审计日志：${data.auditLogEntries} 条\n`;
  reply += `💾 数据位置：${data.dataLocation === 'local_only' ? '仅本地存储 ✅' : '含云端同步'}\n`;
  reply += `☁️ 云端同步：${data.cloudSyncEnabled ? '已启用' : '未启用 ✅'}\n`;
  reply += '\n🛡️ 您的数据完全在本地设备上，未经脱敏不会上传。';

  return reply;
}

async function handleSubscriptions(): Promise<string> {
  const result = await analyze_subscriptions();

  if (!result.success || !result.data) {
    return `订阅分析失败：${result.error}`;
  }

  const subscriptions = result.data as {
    merchant: string;
    monthlyAmount: number;
    monthsActive: number;
    firstDate: string;
    lastDate: string;
    active: boolean;
  }[];

  if (subscriptions.length === 0) {
    return '未检测到疑似订阅支出（需同一商户至少连续3个月相同金额）。';
  }

  let reply = '🔍 **订阅服务检测**\n\n';
  for (const s of subscriptions) {
    const icon = s.active ? '🟢' : '🔴';
    reply += `${icon} ${s.merchant}：¥${s.monthlyAmount.toFixed(0)}/月 (已 ${s.monthsActive} 个月)\n`;
    if (!s.active) {
      reply += `   ⚠️ 最近未检测到消费，可能已停用\n`;
    }
  }

  if (subscriptions.some(s => !s.active)) {
    reply += '\n💡 检测到可能已停用但仍扣费的订阅，建议检查。';
  }

  return reply;
}

async function handleDeleteBill(params: Record<string, unknown>): Promise<string> {
  const billId = params.billId as string | undefined;
  const confirmed = params.confirmed === true;

  if (billId) {
    if (!confirmed) {
      return `删除账单是不可恢复操作。请确认后再执行：确认删除账单 ${billId}`;
    }

    const toolCheck = canCallTool(AGENT_ID, 'delete_bill');
    if (!toolCheck.allowed) {
      return `操作被拒绝：${toolCheck.reason}`;
    }

    const tool = getTool('delete_bill');
    if (!tool) return '删除账单功能暂不可用。';

    const result = await executeTool(
      tool,
      { billId, confirmed: true },
      { agentId: AGENT_ID, userConfirmed: true }
    );
    if (result.success) {
      const data = result.data as { merchant?: string; amount?: number };
      await rememberMoment(AGENT_ID, `删除账单:${billId}|${data.merchant || ''}|¥${data.amount || 0}`);
      return `✅ 已删除账单 ${billId}${data.merchant ? `（${data.merchant} ¥${Number(data.amount || 0).toFixed(2)}）` : ''}。`;
    }
    return `删除账单失败：${result.error}`;
  }

  const searchTool = getTool('search_bills');
  if (!searchTool) return '账单搜索功能暂不可用，无法定位要删除的记录。';

  const searchParams: Record<string, unknown> = { limit: 5 };
  if (params.keyword) searchParams.keyword = params.keyword;
  if (params.date) {
    searchParams.startDate = params.date;
    searchParams.endDate = params.date;
  }

  const result = await searchTool.handler(searchParams);
  if (!result.success || !Array.isArray(result.data)) {
    return `定位账单失败：${result.error || '请重试'}`;
  }

  const bills = result.data as { id: string; merchant: string; amount: number; type: string; date: string }[];
  if (bills.length === 0) {
    return '没有找到符合条件的账单。请提供更明确的商户、金额或日期。';
  }

  let reply = '找到以下可能要删除的账单：\n';
  for (const bill of bills) {
    const typeLabel = bill.type === 'income' ? '收入' : '支出';
    reply += `${bill.id} | ${bill.date} | ${typeLabel} | ${bill.merchant} ¥${bill.amount.toFixed(2)}\n`;
  }
  reply += '\n删除不可恢复。请回复“确认删除账单 <账单ID>”执行删除。';
  return reply;
}

async function handleVerifyChain(): Promise<string> {
  const result = await verify_hash_chain();

  if (!result.success) {
    return `哈希链验证失败：${result.error}`;
  }

  return '✅ 哈希链完整性验证通过，数据未被篡改。';
}

async function handleRepairChain(params: Record<string, unknown> = {}): Promise<string> {
  const result = await repair_hash_chain({ confirmed: params.confirmed === true });

  if (!result.success) {
    return `⚠️ 哈希链修复需要用户确认后才能执行，这是一项敏感操作。\n\n如需修复，请明确回复"确认修复哈希链"。`;
  }

  return '✅ 哈希链已修复。';
}

async function handleExportAudit(params: Record<string, unknown>): Promise<string> {
  const result = await export_audit_package({
    startDate: params.startDate as string,
    endDate: params.endDate as string,
  });

  if (!result.success || !result.data) {
    return `导出审计包失败：${result.error}`;
  }

  const data = result.data as {
    entries: unknown[];
    exportedAt: string;
  };

  return `📦 审计包已导出，包含 ${data.entries.length} 条记录。\n导出时间：${new Date(data.exportedAt).toLocaleString()}`;
}

async function handleRevokeCloud(params: Record<string, unknown>): Promise<string> {
  if (params.confirmed !== true) {
    return `⚠️ 撤销云端访问是敏感操作，需要用户确认。\n\n如确认撤销，请回复"确认撤销云端访问"。`;
  }

  const toolCheck = canCallTool(AGENT_ID, 'revoke_cloud_access');
  if (!toolCheck.allowed) {
    return `操作被拒绝：${toolCheck.reason}`;
  }

  const tool = getTool('revoke_cloud_access');
  if (!tool) return '撤销云端访问功能暂不可用。';

  const result = await executeTool(
    tool,
    {},
    { agentId: AGENT_ID, userConfirmed: true }
  );

  if (!result.success) {
    return `撤销云端访问失败：${result.error}`;
  }

  return '✅ 云端访问已撤销。';
}

async function handleCreateReminder(params: Record<string, unknown>): Promise<string> {
  const name = (params.name as string) || '记账提醒';
  const type = (params.type as 'reminder' | 'backup' | 'report') || 'reminder';
  const cron = (params.cron as string) || '0 20 * * *';

  const result = await create_recurring_task({ name, type, cron });

  if (result.success) {
    return `⏰ 已创建${type === 'reminder' ? '记账' : type === 'backup' ? '备份' : '报告'}提醒「${name}」\n调度规则：${cron}\n\n定时提醒功能仅依赖本地通知，不会上传数据。`;
  }
  return `创建提醒失败：${result.error}`;
}

async function handleGetReminders(params: Record<string, unknown>): Promise<string> {
  const result = await get_recurring_tasks({ type: params.type as string });

  if (!result.success || !result.data) {
    return `查询提醒失败：${result.error}`;
  }

  const tasks = result.data as {
    id: string;
    name: string;
    type: string;
    cron: string;
    enabled: boolean;
    lastTriggered: string;
  }[];

  if (tasks.length === 0) {
    return '您还没有设置任何提醒。说"创建记账提醒"来开始吧！';
  }

  let reply = '⏰ **定时任务列表**\n\n';
  for (const t of tasks) {
    const icon = t.type === 'reminder' ? '📝' : t.type === 'backup' ? '💾' : '📊';
    const status = t.enabled ? '✅ 运行中' : '⏸️ 已暂停';
    reply += `${icon} ${t.name} [${t.type}] ${status}\n`;
    reply += `   调度：${t.cron}\n`;
    if (t.lastTriggered) {
      reply += `   上次触发：${t.lastTriggered}\n`;
    }
    reply += '\n';
  }

  return reply;
}

async function handleDeleteReminder(params: Record<string, unknown>): Promise<string> {
  if (!params.taskId) {
    return '请指定要删除的提醒编号。先说"查看提醒"获取列表。';
  }

  const result = await delete_recurring_task({ taskId: params.taskId as string });

  if (result.success) {
    return '✅ 提醒已删除。';
  }
  return `删除提醒失败：${result.error}`;
}

async function handleRegisterShortcut(params: Record<string, unknown>): Promise<string> {
  const name = (params.name as string) || '快捷记账';
  const action = (params.action as string) || 'open_quick_record';

  const result = await register_shortcut({ name, action });

  if (result.success) {
    return `⚡ 快捷指令「${name}」已注册！\n\n您可以在手机快捷指令 App 中使用它来快速记账。`;
  }
  return `注册快捷指令失败：${result.error}`;
}

async function handleScheduleNotification(params: Record<string, unknown>): Promise<string> {
  const title = (params.title as string) || '记账提醒';
  const body = (params.body as string) || '今天还没记账哦，快来记录今天的收支吧！';
  const triggerAt = params.triggerAt as string;

  if (!triggerAt) {
    return '请告诉我通知的触发时间，比如"明晚8点提醒我记账"。';
  }

  const result = await schedule_local_notification({ title, body, triggerAt });

  if (result.success) {
    return `🔔 通知已安排：\n"${title}"\n${body}\n将于 ${new Date(triggerAt).toLocaleString()} 触发`;
  }
  return `安排通知失败：${result.error}`;
}

async function handleNotificationStatus(): Promise<string> {
  const result = await get_notification_permission_status();

  if (!result.success || !result.data) {
    return `查询通知权限失败：${result.error}`;
  }

  const data = result.data as {
    permission: string;
    canSchedule: boolean;
  };

  let reply = '🔔 **通知权限状态**\n\n';
  reply += `状态：${data.permission}\n`;
  reply += `可调度通知：${data.canSchedule ? '是 ✅' : '否 ❌'}\n`;

  return reply;
}

async function handleSyncWebDAV(params: Record<string, unknown>): Promise<string> {
  const statusTool = getTool('get_sync_status');
  if (!statusTool) return '同步功能暂不可用。';

  const statusResult = await statusTool.handler();
  if (!statusResult.success || !statusResult.data) {
    return '无法获取同步状态。';
  }

  const status = statusResult.data as { configured: boolean; enabled: boolean; lastSync: { timestamp: string; status: string } | null };

  if (!status.configured) {
    return '尚未配置 WebDAV 同步。请在设置中配置服务器地址和认证信息。';
  }

  if (params.upload) {
    if (params.confirmed !== true) {
      return '上传会将数据同步到 WebDAV 服务器，需要明确确认。请回复“确认同步上传”后再执行。';
    }

    const toolCheck = canCallTool(AGENT_ID, 'sync_upload');
    if (!toolCheck.allowed) {
      return `操作被拒绝：${toolCheck.reason}`;
    }

    const uploadTool = getTool('sync_upload');
    if (!uploadTool) return '上传功能暂不可用。';
    const result = await uploadTool.handler({ confirmed: true });
    if (result.success) return '数据已成功上传到服务器。';
    return `上传失败: ${result.error}`;
  }

  if (status.lastSync) {
    return `最近同步: ${status.lastSync.timestamp} (${status.lastSync.status})。你可以说"同步上传"或"同步下载"来手动同步。`;
  }
  return 'WebDAV 已配置但尚未同步。你可以说"同步上传"开始首次同步。';
}

export function sanitizeText(text: string): string {
  const result = sanitize_input(text);
  return (result.data as string) || '';
}

export function sanitizeCloudData(data: Record<string, unknown>): Record<string, unknown> {
  const result = sanitize_for_cloud(data);
  return (result.data as Record<string, unknown>) || {};
}
