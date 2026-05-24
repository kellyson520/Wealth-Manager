import { registerTool } from './tool-registry';
import { PermissionLevel } from '../../shared/types';

import { add_bill, search_bills } from '../../tools/bills/bills.tool';
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
} from '../../tools/automation/automation.tool';

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
    allowedAgents: ['ledger', 'analyst'],
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
    handler: repair_hash_chain,
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
}
