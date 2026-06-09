import { registerTool, type ToolExecutionContext } from './tool-registry';
import { PermissionLevel } from '../../shared/types';

import { add_bill, search_bills, get_bill, modify_bill, delete_bill, split_bill, refund_bill } from '../../tools/bills/bills.tool';
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
  set_budget,
  create_savings_goal,
  get_savings_progress,
} from '../../tools/budget/budget.tool';
import {
  get_streak_info,
  get_achievement,
  update_achievement_progress,
  get_level,
  get_challenges,
} from '../../tools/gamification/gamification.tool';
import {
  run_safety_check,
  analyze_subscriptions,
  sanitize_input,
  sanitize_for_cloud,
  verify_hash_chain,
  repair_hash_chain,
  export_audit_package,
  get_privacy_report,
  revoke_cloud_access,
} from '../../tools/security/security.tool';
import {
  create_recurring_task,
  get_recurring_tasks,
  delete_recurring_task,
  register_shortcut,
  schedule_local_notification,
  get_notification_permission_status,
  schedule_daily_reminder,
  cancel_all_notifications,
  get_shortcuts,
} from '../../tools/automation/automation.tool';
import { evaluate_all_scenarios } from '../../tools/automation/scenario-triggers';
import { run_all_scheduled_tasks, schedule_default_reminders } from '../../tools/automation/task-scheduler';
import {
  run_proactive_check,
  get_proactive_insights,
  get_today_summary,
} from '../../tools/proactive/proactive.tool';
import {
  check_budget_overrun,
  update_savings_progress,
} from '../../tools/budget/budget.tool';
import {
  rules_add,
  rules_search,
  rules_update,
  rules_delete,
  rules_match,
  rules_guess,
  rules_apply,
} from '../../tools/rules/rules.tool';
import {
  add_asset,
  list_assets,
  update_asset_value,
  get_asset_summary,
  delete_asset,
  transfer_asset,
} from '../../tools/assets/assets.tool';
import {
  add_tag,
  list_tags,
  tag_bill,
  untag_bill,
} from '../../tools/tags/tags.tool';
import {
  add_debt,
  list_debts,
  record_repayment,
  get_debt_summary,
  add_credit_card,
} from '../../tools/debt/debt.tool';
import {
  import_csv,
  import_wechat,
  import_alipay,
  get_import_history,
} from '../../tools/import/import.tool';
import {
  ocr_import,
} from '../../tools/import/ocr.tool';
import {
  export_csv,
  export_json,
  create_backup,
} from '../../tools/data/data.tool';
import {
  create_reimbursement,
  update_reimbursement_status,
  list_reimbursements,
  settle_reimbursement,
} from '../../tools/reimbursement/reimbursement.tool';
import {
  configure_webdav,
  sync_upload,
  sync_download,
  get_sync_status,
  list_sync_files,
} from '../../tools/webdav/sync.tool';
import {
  create_link,
  leave_shared,
  delete_link,
} from '../../tools/sharing/sharing.tool';
import {
  delete_ai_memory,
  list_ai_memories,
  refresh_ai_memory_digest,
  remember_user_preference,
  set_ai_learning_enabled,
  update_ai_persona,
} from '../../tools/memory/memory.tool';

let initialized = false;

function p(
  name: string,
  type: 'string' | 'number' | 'boolean' | 'object' | 'array',
  required: boolean,
  description: string
) {
  return { name, type, required, description };
}

export function initToolRegistry(): void {
  if (initialized) return;
  initialized = true;

  registerTool({
    definition: {
      name: 'add_bill',
      description: '新增账单记录（支持自动分类猜测和去重检测）',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('amount', 'number', true, '金额（>0, <99999999）'),
        p('type', 'string', true, '收入/支出'),
        p('merchant', 'string', false, '商户名称'),
        p('category', 'string', false, '消费分类'),
        p('note', 'string', false, '备注'),
        p('date', 'string', false, '日期（默认今天）'),
      ],
      returns: { type: 'ToolResult<BillRecord>', description: '操作结果 + 账单记录' },
      timeout: 5000,
      retryable: true,
      idempotent: false,
    },
    handler: add_bill,
    allowedAgents: ['ledger'],
  });

  registerTool({
    definition: {
      name: 'search_bills',
      description: '多条件模糊搜索账单记录',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('keyword', 'string', false, '搜索关键词'),
        p('startDate', 'string', false, '开始日期'),
        p('endDate', 'string', false, '结束日期'),
        p('category', 'string', false, '分类过滤'),
        p('type', 'string', false, '收入/支出过滤'),
        p('limit', 'number', false, '返回条数上限（默认50）'),
        p('offset', 'number', false, '分页偏移'),
      ],
      returns: { type: 'ToolResult<BillRecord[]>', description: '匹配的账单列表' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: search_bills,
    allowedAgents: ['ledger', 'analyst', 'guardian'],
  });

  registerTool({
    definition: {
      name: 'get_bill',
      description: '根据ID获取单条账单详情',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('billId', 'string', true, '账单ID'),
      ],
      returns: { type: 'ToolResult<BillRecord>', description: '单条账单记录' },
      timeout: 2000,
      retryable: true,
      idempotent: true,
    },
    handler: async (params: { billId: string }) => get_bill(params),
    allowedAgents: ['ledger', 'analyst'],
  });

  registerTool({
    definition: {
      name: 'modify_bill',
      description: '修改已有账单的金额、分类、商户、备注等',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('billId', 'string', true, '账单ID'),
        p('amount', 'number', false, '新金额'),
        p('category', 'string', false, '新分类'),
        p('merchant', 'string', false, '新商户'),
        p('note', 'string', false, '新备注'),
        p('date', 'string', false, '新日期'),
        p('type', 'string', false, '新类型'),
      ],
      returns: { type: 'ToolResult<BillRecord>', description: '更新后的账单' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => modify_bill(params),
    allowedAgents: ['ledger', 'guardian'],
  });

  registerTool({
    definition: {
      name: 'delete_bill',
      description: '删除一条账单记录（不可撤销）',
      permissionLevel: 2 as PermissionLevel,
      parameters: [
        p('billId', 'string', true, '账单ID'),
      ],
      returns: { type: 'ToolResult', description: '删除结果（含被删账单信息）' },
      timeout: 3000,
      retryable: false,
      idempotent: false,
    },
    handler: async (params: { billId: string; confirmed?: boolean }) => delete_bill(params),
    allowedAgents: ['ledger', 'guardian'],
  });

  registerTool({
    definition: {
      name: 'split_bill',
      description: '将一笔账单拆分为多笔（如AA制分账）',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('billId', 'string', true, '原始账单ID'),
        p('splits', 'array', true, '拆分项列表 [{amount, category?, merchant?, note?}]'),
      ],
      returns: { type: 'ToolResult', description: '创建的拆分账单列表' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => split_bill(params),
    allowedAgents: ['ledger'],
  });

  registerTool({
    definition: {
      name: 'refund_bill',
      description: '对已有账单创建退款记录',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('billId', 'string', true, '原账单ID'),
        p('amount', 'number', false, '退款金额（默认全额）'),
        p('note', 'string', false, '备注'),
      ],
      returns: { type: 'ToolResult', description: '退款账单记录 + 原账单信息' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => refund_bill(params),
    allowedAgents: ['ledger'],
  });

  registerTool({
    definition: {
      name: 'get_aggregation',
      description: '按周期（今日/本周/本月）统计收入、支出、笔数、分类占比',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('period', 'string', false, '统计周期（today/week/month，默认today）'),
      ],
      returns: { type: 'ToolResult<AggregationResult>', description: '汇总统计数据' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: get_aggregation,
    allowedAgents: ['ledger', 'analyst'],
  });

  registerTool({
    definition: {
      name: 'get_budget_status',
      description: '查询各分类预算执行情况（已花/剩余/百分比）',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('category', 'string', false, '指定分类，不传则返回全部'),
      ],
      returns: { type: 'ToolResult<BudgetStatus[]>', description: '预算执行状态列表' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: get_budget_status,
    allowedAgents: ['analyst', 'coach'],
  });

  registerTool({
    definition: {
      name: 'get_net_balance',
      description: '计算净资产 = 总资产 - 总负债',
      permissionLevel: 0 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult<NetBalance>', description: '资产/负债/净资产' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: get_net_balance,
    allowedAgents: ['analyst'],
  });

  registerTool({
    definition: {
      name: 'generate_chart_config',
      description: '生成 ECharts 图表配置 JSON（饼图/折线/柱状/仪表盘）',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('chartType', 'string', true, '图表类型（pie/line/bar/gauge）'),
        p('period', 'string', false, '数据周期'),
        p('category', 'string', false, '指定分类'),
      ],
      returns: { type: 'ToolResult<EChartsConfig>', description: '图表配置JSON + 洞察文本' },
      timeout: 5000,
      retryable: true,
      idempotent: true,
    },
    handler: generate_chart_config,
    allowedAgents: ['analyst'],
  });

  registerTool({
    definition: {
      name: 'get_category_trend',
      description: '各分类当月 vs 上月环比趋势分析',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('category', 'string', false, '指定分类，不传则返回全部'),
      ],
      returns: { type: 'ToolResult<CategoryTrend[]>', description: '趋势数据（涨/跌/稳 + 百分比）' },
      timeout: 5000,
      retryable: true,
      idempotent: true,
    },
    handler: get_category_trend,
    allowedAgents: ['analyst'],
  });

  registerTool({
    definition: {
      name: 'get_anomaly_report',
      description: '检测金额尖峰和高频消费异常',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('period', 'string', false, '检测周期（today/week/month）'),
      ],
      returns: { type: 'ToolResult<AnomalyReport[]>', description: '异常列表（类型/严重度/建议）' },
      timeout: 5000,
      retryable: true,
      idempotent: true,
    },
    handler: get_anomaly_report,
    allowedAgents: ['analyst'],
  });

  registerTool({
    definition: {
      name: 'get_merchant_summary',
      description: '商户消费排行（按金额降序）',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('period', 'string', false, '统计周期'),
        p('limit', 'number', false, '返回条数（默认20）'),
      ],
      returns: { type: 'ToolResult<MerchantSummary[]>', description: '商户排行列表' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: get_merchant_summary,
    allowedAgents: ['analyst'],
  });

  registerTool({
    definition: {
      name: 'get_yearly_comparison',
      description: '年度收支月度明细对比',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('year', 'number', false, '年份（默认今年）'),
      ],
      returns: { type: 'ToolResult<YearlyComparison>', description: '年度汇总 + 月度明细' },
      timeout: 5000,
      retryable: true,
      idempotent: true,
    },
    handler: get_yearly_comparison,
    allowedAgents: ['analyst'],
  });

  registerTool({
    definition: {
      name: 'set_budget',
      description: '创建或更新分类月度/周度预算',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('category', 'string', true, '分类名称'),
        p('limit', 'number', true, '预算金额（>0）'),
        p('period', 'string', false, '周期（monthly/weekly，默认monthly）'),
      ],
      returns: { type: 'ToolResult<BudgetLimit>', description: '设定的预算记录' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: set_budget,
    allowedAgents: ['coach'],
  });

  registerTool({
    definition: {
      name: 'create_savings_goal',
      description: '创建储蓄目标',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('name', 'string', true, '目标名称'),
        p('targetAmount', 'number', true, '目标金额'),
        p('deadline', 'string', false, '截止日期'),
      ],
      returns: { type: 'ToolResult<SavingsGoal>', description: '创建的储蓄目标' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: create_savings_goal,
    allowedAgents: ['coach'],
  });

  registerTool({
    definition: {
      name: 'get_savings_progress',
      description: '查看储蓄目标进度',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('goalId', 'string', false, '目标ID（不传则返回全部）'),
      ],
      returns: { type: 'ToolResult<SavingsGoal[]>', description: '储蓄目标列表及进度' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: get_savings_progress,
    allowedAgents: ['coach'],
  });

  registerTool({
    definition: {
      name: 'get_streak_info',
      description: '获取记账连续打卡信息',
      permissionLevel: 0 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult<StreakInfo>', description: '当前/最长连续天数 + 总天数' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: get_streak_info,
    allowedAgents: ['coach'],
  });

  registerTool({
    definition: {
      name: 'get_achievement',
      description: '查看成就及进度',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('achievementId', 'string', false, '成就ID（不传则返回全部）'),
      ],
      returns: { type: 'ToolResult<Achievement[]>', description: '成就列表（含已解锁/未解锁）' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: get_achievement,
    allowedAgents: ['coach'],
  });

  registerTool({
    definition: {
      name: 'update_achievement_progress',
      description: '更新成就进度（通常由系统自动触发）',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('achievementId', 'string', true, '成就ID'),
        p('progress', 'number', true, '当前进度值'),
      ],
      returns: { type: 'ToolResult', description: '更新结果（含是否解锁）' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: update_achievement_progress,
    allowedAgents: ['coach'],
  });

  registerTool({
    definition: {
      name: 'run_safety_check',
      description: '实时安全扫描：金额尖峰/重复/高频检测',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('amount', 'number', false, '需检查的金额'),
        p('merchant', 'string', false, '商户名'),
        p('billId', 'string', false, '账单ID'),
      ],
      returns: { type: 'ToolResult<SafetyCheckResult>', description: '风险级别 + 问题列表 + 建议' },
      timeout: 5000,
      retryable: true,
      idempotent: true,
    },
    handler: run_safety_check,
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'analyze_subscriptions',
      description: '检测僵尸订阅：同商户+同金额+连续3个月以上',
      permissionLevel: 0 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult<Subscription[]>', description: '疑似订阅列表' },
      timeout: 5000,
      retryable: true,
      idempotent: true,
    },
    handler: analyze_subscriptions,
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'sanitize_input',
      description: '文本消毒：去除 XSS / HTML / JS 协议，限长 2000 字符',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('text', 'string', true, '待消毒的原始文本'),
      ],
      returns: { type: 'ToolResult<string>', description: '消毒后的安全文本' },
      timeout: 1000,
      retryable: false,
      idempotent: true,
    },
    handler: async ({ text }: { text: string }) => sanitize_input(text),
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'sanitize_for_cloud',
      description: '云端数据脱敏：仅保留 date/amount/category/type/period',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('data', 'object', true, '待脱敏的数据对象'),
      ],
      returns: { type: 'ToolResult<Record>', description: '脱敏后的安全数据' },
      timeout: 1000,
      retryable: false,
      idempotent: true,
    },
    handler: async (params: { data: Record<string, unknown> }) => sanitize_for_cloud(params.data),
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'verify_hash_chain',
      description: '验证账单哈希链完整性',
      permissionLevel: 0 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult', description: '验证结果（完整/断裂）' },
      timeout: 5000,
      retryable: true,
      idempotent: true,
    },
    handler: verify_hash_chain,
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'repair_hash_chain',
      description: '修复断裂的哈希链（需用户确认）',
      permissionLevel: 2 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult', description: '修复结果' },
      timeout: 10000,
      retryable: false,
      idempotent: false,
    },
    handler: async (params?: { confirmed?: boolean }) => repair_hash_chain(params),
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'export_audit_package',
      description: '导出审计日志包（最多 1000 条）',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('startDate', 'string', false, '开始日期'),
        p('endDate', 'string', false, '结束日期'),
      ],
      returns: { type: 'ToolResult', description: '审计条目 + 导出时间' },
      timeout: 5000,
      retryable: true,
      idempotent: true,
    },
    handler: (params: { startDate?: string; endDate?: string }) => export_audit_package(params),
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'get_privacy_report',
      description: '获取隐私报告（数据全在本地）',
      permissionLevel: 0 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult', description: '账单数/分类数/审计条目/数据位置' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: get_privacy_report,
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'revoke_cloud_access',
      description: '撤销云端数据访问权限（需用户确认）',
      permissionLevel: 2 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult', description: '撤销结果' },
      timeout: 5000,
      retryable: false,
      idempotent: false,
    },
    handler: revoke_cloud_access,
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'create_recurring_task',
      description: '创建定时提醒/备份/报告任务',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('name', 'string', true, '任务名称'),
        p('type', 'string', true, '类型（reminder/backup/report）'),
        p('cron', 'string', true, 'cron 表达式'),
      ],
      returns: { type: 'ToolResult<RecurringTask>', description: '创建的任务记录' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: (params: { name: string; type: 'reminder' | 'backup' | 'report'; cron: string }) =>
      create_recurring_task(params),
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'get_recurring_tasks',
      description: '查询定时任务列表',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('type', 'string', false, '任务类型过滤'),
      ],
      returns: { type: 'ToolResult<RecurringTask[]>', description: '定时任务列表' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: (params?: { type?: string }) => get_recurring_tasks(params),
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'delete_recurring_task',
      description: '删除定时任务',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('taskId', 'string', true, '任务ID'),
      ],
      returns: { type: 'ToolResult', description: '删除结果' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: (params: { taskId: string }) => delete_recurring_task(params),
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'register_shortcut',
      description: '注册快捷记账指令',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('name', 'string', true, '快捷指令名称'),
        p('action', 'string', true, '动作标识'),
        p('icon', 'string', false, '图标'),
      ],
      returns: { type: 'ToolResult', description: '注册结果' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: (params: { name: string; action: string; icon?: string }) =>
      register_shortcut(params),
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'schedule_local_notification',
      description: '调度本地通知',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('title', 'string', true, '通知标题'),
        p('body', 'string', true, '通知内容'),
        p('triggerAt', 'string', true, '触发时间（ISO 格式）'),
      ],
      returns: { type: 'ToolResult', description: '调度结果' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: (params: { title: string; body: string; triggerAt: string }) =>
      schedule_local_notification(params),
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'get_notification_permission_status',
      description: '获取本地通知权限状态',
      permissionLevel: 0 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult', description: '权限状态' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: get_notification_permission_status,
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'check_budget_overrun',
      description: '检查预算超标情况，返回所有超过 80% 的分类及严重程度',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('category', 'string', false, '指定分类，不传则检查全部'),
        p('amount', 'number', false, '新增金额（用于预估超支）'),
      ],
      returns: { type: 'ToolResult<{alerts: BudgetOverrunAlert[], hasOverrun: boolean}>', description: '超标警报列表' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: check_budget_overrun,
    allowedAgents: ['coach', 'analyst'],
  });

  registerTool({
    definition: {
      name: 'update_savings_progress',
      description: '根据当前收入自动更新所有储蓄目标的进度',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('goalId', 'string', false, '指定目标ID，不传则更新全部'),
      ],
      returns: { type: 'ToolResult<SavingsGoal[]>', description: '更新后的储蓄目标' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: update_savings_progress,
    allowedAgents: ['coach'],
  });

  registerTool({
    definition: {
      name: 'schedule_daily_reminder',
      description: '调度每日定时提醒通知',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('title', 'string', true, '通知标题'),
        p('body', 'string', true, '通知内容'),
        p('hour', 'number', true, '小时（0-23）'),
        p('minute', 'number', true, '分钟（0-59）'),
      ],
      returns: { type: 'ToolResult', description: '调度结果' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: (params: { title: string; body: string; hour: number; minute: number }) =>
      schedule_daily_reminder(params),
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'cancel_all_notifications',
      description: '取消所有已调度的本地通知',
      permissionLevel: 1 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult', description: '取消结果' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: cancel_all_notifications,
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'get_shortcuts',
      description: '获取所有已注册的快捷指令',
      permissionLevel: 0 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult<ShortcutRecord[]>', description: '快捷指令列表' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: get_shortcuts,
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'evaluate_all_scenarios',
      description: '评估所有通知场景（记账提醒、预算超标、3天未记、成就解锁）并触发相应通知',
      permissionLevel: 1 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult', description: '场景评估及通知触发结果' },
      timeout: 5000,
      retryable: true,
      idempotent: false,
    },
    handler: evaluate_all_scenarios,
    allowedAgents: ['guardian', 'coach'],
  });

  registerTool({
    definition: {
      name: 'run_all_scheduled_tasks',
      description: '执行所有到期计划任务',
      permissionLevel: 1 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult', description: '执行结果统计' },
      timeout: 10000,
      retryable: true,
      idempotent: false,
    },
    handler: run_all_scheduled_tasks,
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'schedule_default_reminders',
      description: '配置系统默认提醒（每日记账提醒 + 长时间未记录检查）',
      permissionLevel: 1 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult', description: '配置结果' },
      timeout: 5000,
      retryable: true,
      idempotent: true,
    },
    handler: schedule_default_reminders,
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'run_proactive_check',
      description: 'AI主动服务：运行所有主动检查（预算健康、长期未记、即将达成成就、储蓄进度、智能洞察）',
      permissionLevel: 0 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult<ProactiveFindings>', description: '综合主动服务检查结果' },
      timeout: 8000,
      retryable: true,
      idempotent: true,
    },
    handler: run_proactive_check,
    allowedAgents: ['coach', 'analyst'],
  });

  registerTool({
    definition: {
      name: 'get_proactive_insights',
      description: '获取AI生成的个性化理财洞察与建议',
      permissionLevel: 0 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult<{insights: string[]}>', description: '个性化洞察列表' },
      timeout: 5000,
      retryable: true,
      idempotent: true,
    },
    handler: get_proactive_insights,
    allowedAgents: ['coach', 'analyst'],
  });

  registerTool({
    definition: {
      name: 'get_today_summary',
      description: '获取今日及本月收支概览 + 预算状态摘要',
      permissionLevel: 0 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult<{today, month, budgetStatus}>', description: '当日总结' },
      timeout: 5000,
      retryable: true,
      idempotent: true,
    },
    handler: get_today_summary,
    allowedAgents: ['analyst', 'coach'],
  });

  registerTool({
    definition: {
      name: 'rules_add',
      description: '添加分类规则（条件匹配 → 动作执行）',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('name', 'string', true, '规则名称'),
        p('description', 'string', false, '规则描述'),
        p('priority', 'number', false, '优先级（数字越大越优先）'),
        p('conditions', 'object', true, '条件组 {operator: "and"|"or", conditions: [...]}'),
        p('actions', 'array', true, '动作列表 [{type: "set_category", target: "...", value: "..."}]'),
        p('createdBy', 'string', false, '创建者'),
      ],
      returns: { type: 'ToolResult<ClassificationRule>', description: '创建的规则记录' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params) => rules_add(params as any),
    allowedAgents: ['coach', 'guardian'],
  });

  registerTool({
    definition: {
      name: 'rules_search',
      description: '搜索已配置的分类规则',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('keyword', 'string', false, '搜索关键词'),
        p('enabled', 'boolean', false, '是否只查启用的'),
        p('createdBy', 'string', false, '按创建者过滤'),
        p('limit', 'number', false, '返回条数'),
        p('offset', 'number', false, '分页偏移'),
      ],
      returns: { type: 'ToolResult<ClassificationRule[]>', description: '规则列表' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: async (params) => rules_search(params ?? {}),
    allowedAgents: ['analyst', 'coach', 'guardian'],
  });

  registerTool({
    definition: {
      name: 'rules_update',
      description: '更新已有规则的条件或动作',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('ruleId', 'string', true, '规则ID'),
        p('name', 'string', false, '新名称'),
        p('description', 'string', false, '新描述'),
        p('priority', 'number', false, '新优先级'),
        p('enabled', 'boolean', false, '启用/禁用'),
        p('conditions', 'object', false, '新条件组'),
        p('actions', 'array', false, '新动作列表'),
      ],
      returns: { type: 'ToolResult', description: '更新结果' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params) => rules_update(params as any),
    allowedAgents: ['coach', 'guardian'],
  });

  registerTool({
    definition: {
      name: 'rules_delete',
      description: '删除一条分类规则',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('ruleId', 'string', true, '规则ID'),
      ],
      returns: { type: 'ToolResult', description: '删除结果' },
      timeout: 3000,
      retryable: false,
      idempotent: false,
    },
    handler: async (params) => rules_delete(params as any),
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'rules_match',
      description: '根据输入事实匹配符合条件的规则',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('facts', 'object', true, '待匹配的事实数据'),
        p('maxResults', 'number', false, '最多返回条数'),
        p('minConfidence', 'number', false, '最低置信度'),
      ],
      returns: { type: 'ToolResult', description: '匹配的规则列表' },
      timeout: 5000,
      retryable: true,
      idempotent: true,
    },
    handler: async (params) => rules_match(params as any),
    allowedAgents: ['ledger', 'analyst', 'coach'],
  });

  registerTool({
    definition: {
      name: 'rules_guess',
      description: '根据商户名和金额猜测最可能的分类',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('merchant', 'string', false, '商户名称'),
        p('amount', 'number', false, '金额'),
        p('note', 'string', false, '备注'),
      ],
      returns: { type: 'ToolResult', description: '猜测的分类及置信度' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: async (params) => rules_guess(params ?? {}),
    allowedAgents: ['ledger', 'coach'],
  });

  registerTool({
    definition: {
      name: 'rules_apply',
      description: '批量应用规则到指定账单',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('ruleIds', 'array', false, '规则ID列表'),
        p('billIds', 'array', false, '账单ID列表'),
      ],
      returns: { type: 'ToolResult', description: '应用结果统计' },
      timeout: 10000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params) => rules_apply(params ?? {}),
    allowedAgents: ['ledger', 'coach', 'guardian'],
  });

  registerTool({
    definition: {
      name: 'add_asset',
      description: '添加资产记录（现金、银行账户、股票、基金、房产等）',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('name', 'string', true, '资产名称'),
        p('type', 'string', false, '资产类型（现金/银行账户/股票/基金/房产/车辆/债权/其他）'),
        p('amount', 'number', true, '资产金额（>=0）'),
        p('currency', 'string', false, '货币（默认CNY）'),
        p('note', 'string', false, '备注'),
      ],
      returns: { type: 'ToolResult<AssetRecord>', description: '创建的资产记录' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => add_asset(params),
    allowedAgents: ['ledger', 'coach'],
  });

  registerTool({
    definition: {
      name: 'list_assets',
      description: '查询资产列表，按金额降序排列',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('type', 'string', false, '按类型过滤'),
        p('keyword', 'string', false, '按名称/备注搜索'),
        p('limit', 'number', false, '返回条数'),
      ],
      returns: { type: 'ToolResult<AssetRecord[]>', description: '资产列表' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: async (params?: any) => list_assets(params),
    allowedAgents: ['ledger', 'analyst', 'coach'],
  });

  registerTool({
    definition: {
      name: 'update_asset_value',
      description: '更新资产金额',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('assetId', 'string', true, '资产ID'),
        p('amount', 'number', true, '新金额'),
        p('note', 'string', false, '备注'),
      ],
      returns: { type: 'ToolResult', description: '更新结果' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => update_asset_value(params),
    allowedAgents: ['ledger', 'coach'],
  });

  registerTool({
    definition: {
      name: 'get_asset_summary',
      description: '获取资产总览：按类型汇总 + 总资产',
      permissionLevel: 0 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult<{breakdown, totalAssets}>', description: '资产分类汇总 + 总资产' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: get_asset_summary,
    allowedAgents: ['analyst', 'coach'],
  });

  registerTool({
    definition: {
      name: 'delete_asset',
      description: '删除资产记录',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('assetId', 'string', true, '资产ID'),
      ],
      returns: { type: 'ToolResult', description: '删除结果' },
      timeout: 3000,
      retryable: false,
      idempotent: false,
    },
    handler: async (params: any) => delete_asset(params),
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'add_tag',
      description: '创建账单标签',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('name', 'string', true, '标签名称'),
        p('color', 'string', false, '标签颜色（默认#4A90D9）'),
      ],
      returns: { type: 'ToolResult<TagRecord>', description: '创建的标签' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => add_tag(params),
    allowedAgents: ['ledger', 'coach'],
  });

  registerTool({
    definition: {
      name: 'list_tags',
      description: '查询标签列表（含使用次数）',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('keyword', 'string', false, '搜索关键词'),
        p('limit', 'number', false, '返回条数'),
      ],
      returns: { type: 'ToolResult<TagRecord[]>', description: '标签列表' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: async (params?: any) => list_tags(params),
    allowedAgents: ['ledger', 'analyst', 'coach'],
  });

  registerTool({
    definition: {
      name: 'tag_bill',
      description: '给账单添加标签',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('billId', 'string', true, '账单ID'),
        p('tagId', 'string', true, '标签ID'),
      ],
      returns: { type: 'ToolResult', description: '标记结果' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: async (params: any) => tag_bill(params),
    allowedAgents: ['ledger'],
  });

  registerTool({
    definition: {
      name: 'untag_bill',
      description: '移除账单标签',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('billId', 'string', true, '账单ID'),
        p('tagId', 'string', true, '标签ID'),
      ],
      returns: { type: 'ToolResult', description: '移除结果' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => untag_bill(params),
    allowedAgents: ['ledger'],
  });

  registerTool({
    definition: {
      name: 'add_debt',
      description: '添加债务记录（借出/借入）',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('title', 'string', true, '债务标题'),
        p('type', 'string', true, '类型（借出/借入）'),
        p('principal', 'number', true, '本金'),
        p('counterparty', 'string', true, '交易对方'),
        p('interestRate', 'number', false, '年利率'),
        p('startDate', 'string', false, '起始日期'),
        p('dueDate', 'string', false, '到期日期'),
        p('note', 'string', false, '备注'),
      ],
      returns: { type: 'ToolResult<DebtRecord>', description: '创建的债务记录' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => add_debt(params),
    allowedAgents: ['ledger'],
  });

  registerTool({
    definition: {
      name: 'list_debts',
      description: '查询债务列表，按状态和创建时间排序',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('type', 'string', false, '按类型过滤'),
        p('status', 'string', false, '按状态过滤（active/cleared/overdue）'),
        p('counterparty', 'string', false, '按对方搜索'),
        p('limit', 'number', false, '返回条数'),
      ],
      returns: { type: 'ToolResult<DebtRecord[]>', description: '债务列表' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: async (params?: any) => list_debts(params),
    allowedAgents: ['ledger', 'analyst'],
  });

  registerTool({
    definition: {
      name: 'record_repayment',
      description: '记录还款（自动计算剩余金额和状态）',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('debtId', 'string', true, '债务ID'),
        p('amount', 'number', true, '还款金额'),
        p('date', 'string', false, '还款日期'),
        p('note', 'string', false, '备注'),
      ],
      returns: { type: 'ToolResult', description: '还款记录 + 新剩余金额 + 新状态' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => record_repayment(params),
    allowedAgents: ['ledger'],
  });

  registerTool({
    definition: {
      name: 'get_debt_summary',
      description: '获取债务总览：借出/借入总额、活跃金额、逾期数、净资产位置',
      permissionLevel: 0 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult<DebtSummary>', description: '债务汇总统计' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: get_debt_summary,
    allowedAgents: ['analyst', 'coach'],
  });

  registerTool({
    definition: {
      name: 'import_csv',
      description: '导入CSV格式账单数据（自动解析列：商户,金额,类型,分类,日期,备注）',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('csvContent', 'string', true, 'CSV文件内容'),
        p('delimiter', 'string', false, '分隔符（默认逗号）'),
        p('hasHeader', 'boolean', false, '是否包含表头（默认false）'),
      ],
      returns: { type: 'ToolResult<{importedCount, errors}>', description: '导入结果' },
      timeout: 30000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => import_csv(params),
    allowedAgents: ['ledger', 'guardian'],
  });

  registerTool({
    definition: {
      name: 'import_wechat',
      description: '解析并导入微信账单文本（支持多种格式自动识别）',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('rawText', 'string', true, '微信账单原始文本'),
      ],
      returns: { type: 'ToolResult', description: '导入结果' },
      timeout: 30000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => import_wechat(params),
    allowedAgents: ['ledger', 'guardian'],
  });

  registerTool({
    definition: {
      name: 'import_alipay',
      description: '解析并导入支付宝账单文本',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('rawText', 'string', true, '支付宝账单原始文本'),
      ],
      returns: { type: 'ToolResult', description: '导入结果' },
      timeout: 30000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => import_alipay(params),
    allowedAgents: ['ledger', 'guardian'],
  });

  registerTool({
    definition: {
      name: 'get_import_history',
      description: '查询导入历史记录（按日期统计）',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('limit', 'number', false, '返回条数'),
      ],
      returns: { type: 'ToolResult<ImportHistory[]>', description: '导入历史' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: async (params?: any) => get_import_history(params),
    allowedAgents: ['ledger', 'analyst'],
  });

  registerTool({
    definition: {
      name: 'ocr_import',
      description: 'OCR文本识别导入：从截图/图片识别出的文本中提取账单信息',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('rawText', 'string', true, 'OCR识别的原始文本'),
        p('source', 'string', false, '来源标识'),
      ],
      returns: { type: 'ToolResult', description: '导入的账单列表' },
      timeout: 15000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => ocr_import(params),
    allowedAgents: ['ledger', 'guardian'],
  });

  registerTool({
    definition: {
      name: 'export_csv',
      description: '导出账单为CSV文件',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('startDate', 'string', false, '开始日期'),
        p('endDate', 'string', false, '结束日期'),
        p('category', 'string', false, '分类过滤'),
      ],
      returns: { type: 'ToolResult<{filename, filePath, rowCount}>', description: '导出结果' },
      timeout: 10000,
      retryable: true,
      idempotent: true,
    },
    handler: async (params?: any) => export_csv(params),
    allowedAgents: ['guardian', 'analyst'],
  });

  registerTool({
    definition: {
      name: 'export_json',
      description: '导出账单为JSON文件',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('startDate', 'string', false, '开始日期'),
        p('endDate', 'string', false, '结束日期'),
      ],
      returns: { type: 'ToolResult', description: '导出结果' },
      timeout: 10000,
      retryable: true,
      idempotent: true,
    },
    handler: async (params?: any) => export_json(params),
    allowedAgents: ['guardian', 'analyst'],
  });

  registerTool({
    definition: {
      name: 'create_backup',
      description: '创建完整数据备份（含所有表数据）',
      permissionLevel: 1 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult<{backupId, filename}>', description: '备份结果' },
      timeout: 15000,
      retryable: true,
      idempotent: true,
    },
    handler: create_backup,
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'create_reimbursement',
      description: '创建报销任务记录',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('title', 'string', true, '报销标题'),
        p('amount', 'number', true, '报销金额'),
        p('category', 'string', false, '分类'),
        p('merchant', 'string', false, '商户'),
        p('date', 'string', false, '发生日期'),
        p('note', 'string', false, '备注'),
      ],
      returns: { type: 'ToolResult<ReimbursementRecord>', description: '创建的报销记录' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => create_reimbursement(params),
    allowedAgents: ['ledger'],
  });

  registerTool({
    definition: {
      name: 'update_reimbursement_status',
      description: '更新报销状态（submitted/approved/rejected/paid）',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('taskId', 'string', true, '报销任务ID'),
        p('status', 'string', true, '新状态'),
      ],
      returns: { type: 'ToolResult', description: '更新结果' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => update_reimbursement_status(params),
    allowedAgents: ['ledger', 'coach'],
  });

  registerTool({
    definition: {
      name: 'list_reimbursements',
      description: '查询报销列表（含待审批/已审批金额汇总）',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('status', 'string', false, '按状态过滤'),
        p('startDate', 'string', false, '开始日期'),
        p('endDate', 'string', false, '结束日期'),
        p('limit', 'number', false, '返回条数'),
      ],
      returns: { type: 'ToolResult<{tasks, summary}>', description: '报销列表 + 汇总' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: async (params?: any) => list_reimbursements(params),
    allowedAgents: ['analyst', 'coach'],
  });

  registerTool({
    definition: {
      name: 'configure_webdav',
      description: '配置 WebDAV 多端同步（服务器地址 + 认证），自动测试连接',
      permissionLevel: 2 as PermissionLevel,
      parameters: [
        p('url', 'string', true, 'WebDAV 服务器地址'),
        p('username', 'string', true, '用户名'),
        p('password', 'string', true, '密码'),
        p('enabled', 'boolean', false, '是否启用（默认true）'),
      ],
      returns: { type: 'ToolResult', description: '配置结果 + 连接测试' },
      timeout: 10000,
      retryable: false,
      idempotent: false,
    },
    handler: async (params: any) => configure_webdav(params),
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'sync_upload',
      description: '上传本地数据备份到 WebDAV 服务器（支持加密）',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('subfolder', 'string', false, '服务器子目录'),
        p('encrypt', 'boolean', false, '是否加密上传（推荐）'),
        p('passphrase', 'string', false, '加密密码'),
      ],
      returns: { type: 'ToolResult', description: '上传结果（文件名、大小、表数量、加密信息）' },
      timeout: 30000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params?: any) => sync_upload(params),
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'sync_download',
      description: '从 WebDAV 下载同步数据并合并到本地（支持覆盖/合并策略 + 解密）',
      permissionLevel: 2 as PermissionLevel,
      parameters: [
        p('filename', 'string', false, '指定文件名（不传则下载最新）'),
        p('subfolder', 'string', false, '服务器子目录'),
        p('mergeStrategy', 'string', false, '合并策略：overwrite/merge_newer/merge_all'),
        p('decrypt', 'boolean', false, '是否需要解密'),
        p('passphrase', 'string', false, '解密密码'),
        p('salt', 'string', false, '加密盐值（上传时返回）'),
      ],
      returns: { type: 'ToolResult', description: '下载+合并结果' },
      timeout: 60000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params?: any) => sync_download(params),
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'get_sync_status',
      description: '获取 WebDAV 同步配置状态 + 最近一次同步时间',
      permissionLevel: 0 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult', description: '同步配置及上次同步状态' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: get_sync_status,
    allowedAgents: ['guardian', 'analyst'],
  });

  registerTool({
    definition: {
      name: 'get_level',
      description: '获取用户等级、头衔、经验值和进度',
      permissionLevel: 0 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult<{level, title, experience, progress}>', description: '等级信息' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: get_level,
    allowedAgents: ['coach'],
  });

  registerTool({
    definition: {
      name: 'get_challenges',
      description: '获取每日/每周挑战任务列表及完成状态',
      permissionLevel: 0 as PermissionLevel,
      parameters: [],
      returns: { type: 'ToolResult<Challenge[]>', description: '挑战列表' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: get_challenges,
    allowedAgents: ['coach'],
  });

  registerTool({
    definition: {
      name: 'create_link',
      description: '创建账单分享链接（按日期或选择账单，支持过期时间）',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('billIds', 'array', false, '要分享的账单ID列表'),
        p('startDate', 'string', false, '分享起始日期'),
        p('endDate', 'string', false, '分享结束日期'),
        p('expiresInHours', 'number', false, '链接有效小时数'),
      ],
      returns: { type: 'ToolResult', description: '分享链接 + token + 账单概要' },
      timeout: 5000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any, context?: ToolExecutionContext) => create_link({
      ...params,
      ownerId: context?.agentId,
    }),
    allowedAgents: ['guardian', 'coach'],
  });

  registerTool({
    definition: {
      name: 'leave_shared',
      description: '通过分享令牌访问共享的账单数据',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('token', 'string', true, '分享令牌'),
      ],
      returns: { type: 'ToolResult', description: '共享的账单列表' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: async (params: any, context?: ToolExecutionContext) => leave_shared({
      ...params,
      callerId: context?.agentId,
    }),
    allowedAgents: ['analyst', 'coach'],
  });

  registerTool({
    definition: {
      name: 'delete_link',
      description: '删除已创建的分享链接',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('linkId', 'string', true, '分享链接ID'),
      ],
      returns: { type: 'ToolResult', description: '删除结果' },
      timeout: 3000,
      retryable: false,
      idempotent: false,
    },
    handler: async (params: any, context?: ToolExecutionContext) => delete_link({
      ...params,
      callerId: context?.agentId,
    }),
    allowedAgents: ['guardian'],
  });

  registerTool({
    definition: {
      name: 'add_credit_card',
      description: '添加信用卡记录（含额度、账单日、还款日）',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('name', 'string', true, '信用卡名称'),
        p('bank', 'string', true, '发卡银行'),
        p('creditLimit', 'number', true, '信用额度'),
        p('billDay', 'number', false, '账单日（默认1号）'),
        p('paymentDay', 'number', false, '还款日（默认25号）'),
        p('note', 'string', false, '备注'),
      ],
      returns: { type: 'ToolResult', description: '信用卡记录' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => add_credit_card(params),
    allowedAgents: ['ledger', 'coach'],
  });

  registerTool({
    definition: {
      name: 'transfer_asset',
      description: '资产转账（从一个资产账户转到另一个）',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('fromAssetId', 'string', true, '转出资产ID'),
        p('toAssetId', 'string', true, '转入资产ID'),
        p('amount', 'number', true, '转账金额'),
        p('note', 'string', false, '备注'),
      ],
      returns: { type: 'ToolResult', description: '转账结果（双方新余额）' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => transfer_asset(params),
    allowedAgents: ['ledger'],
  });

  registerTool({
    definition: {
      name: 'settle_reimbursement',
      description: '结算已审批的报销（状态：approved→paid）',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('taskId', 'string', true, '报销任务ID'),
      ],
      returns: { type: 'ToolResult', description: '结算结果' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => settle_reimbursement(params),
    allowedAgents: ['ledger', 'coach'],
  });

  registerTool({
    definition: {
      name: 'list_sync_files',
      description: '列出 WebDAV 服务器上的同步文件',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('subfolder', 'string', false, '服务器子目录'),
      ],
      returns: { type: 'ToolResult', description: '文件列表' },
      timeout: 10000,
      retryable: true,
      idempotent: true,
    },
    handler: async (params?: any) => list_sync_files(params),
    allowedAgents: ['guardian', 'analyst'],
  });

  registerTool({
    definition: {
      name: 'list_ai_memories',
      description: '查看 AI 已保存的人格/用户偏好/工具学习记忆',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('kind', 'string', false, '记忆类型 user_profile/memory_engine/nlu_learning'),
        p('limit', 'number', false, '返回条数'),
      ],
      returns: { type: 'ToolResult<AiMemoryView[]>', description: 'AI 记忆列表' },
      timeout: 3000,
      retryable: true,
      idempotent: true,
    },
    handler: async (params?: any) => list_ai_memories(params),
    allowedAgents: ['master', 'guardian'],
  });

  registerTool({
    definition: {
      name: 'delete_ai_memory',
      description: '删除或停用一条 AI 记忆',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('id', 'string', true, '记忆ID'),
        p('kind', 'string', true, '记忆类型 user_profile/memory_engine/nlu_learning'),
      ],
      returns: { type: 'ToolResult', description: '删除结果' },
      timeout: 3000,
      retryable: false,
      idempotent: false,
    },
    handler: async (params: any) => delete_ai_memory(params),
    allowedAgents: ['master', 'guardian'],
  });

  registerTool({
    definition: {
      name: 'update_ai_persona',
      description: '更新 AI 人格参数或 SOUL/TONE/BOUNDARIES 快照',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('rigor', 'number', false, '严谨度 0-10'),
        p('humor', 'number', false, '幽默度 0-10'),
        p('proactivity', 'number', false, '主动性 0-10'),
        p('soul', 'string', false, '稳定身份描述'),
        p('toneRules', 'array', false, '语气规则列表'),
        p('boundaries', 'array', false, '边界规则列表'),
      ],
      returns: { type: 'ToolResult', description: '更新后的人格快照' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => update_ai_persona(params),
    allowedAgents: ['master', 'guardian'],
  });

  registerTool({
    definition: {
      name: 'remember_user_preference',
      description: '保存用户明确表达的长期偏好',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('key', 'string', true, '偏好键'),
        p('value', 'string', true, '偏好内容'),
        p('confidence', 'number', false, '置信度 0-1'),
      ],
      returns: { type: 'ToolResult<UserProfileMemory>', description: '保存的用户偏好记忆' },
      timeout: 3000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => remember_user_preference(params),
    allowedAgents: ['master', 'coach', 'guardian'],
  });

  registerTool({
    definition: {
      name: 'set_ai_learning_enabled',
      description: '开启或关闭 AI 自动学习 NLU 表达',
      permissionLevel: 1 as PermissionLevel,
      parameters: [
        p('enabled', 'boolean', true, '是否启用自动学习'),
      ],
      returns: { type: 'ToolResult<{enabled:boolean}>', description: '学习开关状态' },
      timeout: 2000,
      retryable: true,
      idempotent: false,
    },
    handler: async (params: any) => set_ai_learning_enabled(params),
    allowedAgents: ['master', 'guardian'],
  });

  registerTool({
    definition: {
      name: 'refresh_ai_memory_digest',
      description: '刷新 AI 记忆摘要快照',
      permissionLevel: 0 as PermissionLevel,
      parameters: [
        p('agentId', 'string', false, 'Agent ID'),
        p('tokenBudget', 'number', false, '摘要预算'),
      ],
      returns: { type: 'ToolResult<{digest:string}>', description: '最新记忆摘要' },
      timeout: 5000,
      retryable: true,
      idempotent: true,
    },
    handler: async (params?: any) => refresh_ai_memory_digest(params),
    allowedAgents: ['master', 'guardian'],
  });
}
