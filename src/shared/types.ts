export type BillType = 'income' | 'expense' | 'refund';
export type BillSource = 'manual' | 'import' | 'auto' | 'ocr';
export type MessageRole = 'user' | 'assistant' | 'system';
export type AgentId = 'master' | 'ledger' | 'analyst' | 'coach' | 'guardian';
export type PermissionLevel = 0 | 1 | 2;

export interface BillRecord {
  id: string;
  amount: number;
  type: BillType;
  category: string;
  tags: string[];
  merchant: string;
  rawDescription: string;
  date: string;
  note: string;
  source: BillSource;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  data?: BillCardData | SummaryCardData | ChartCardData | ConfirmCardData | ErrorCardData | TipCardData | BillDetailCardData | RecordConfirmCardData;
}

export interface BillCardData {
  type: 'bill_card';
  bill: BillRecord;
}

export interface SummaryCardData {
  type: 'summary_card';
  totalIncome: number;
  totalExpense: number;
  billCount: number;
  period: string;
}

export interface ChartCardData {
  type: 'chart_card';
  chartType: 'pie' | 'line' | 'bar' | 'sankey' | 'radar' | 'heatmap' | 'gauge' | 'stacked_bar';
  title: string;
  period: string;
  config: Record<string, unknown>;
  insight?: string;
}

export interface ConfirmCardData {
  type: 'confirm_card' | 'security_confirm_card';
  title: string;
  message: string;
  actionId: string;
  riskLevel: 'low' | 'medium' | 'high';
  confirmLabel?: string;
  cancelLabel?: string;
  detailItems?: { label: string; value: string; isSensitive?: boolean }[];
  cooldownSeconds?: number;
}

export interface ErrorCardData {
  type: 'error_card';
  errorCode: string;
  message: string;
  detail?: string;
  suggestedAction?: string;
  retryable: boolean;
  onRetry?: () => void;
}

export interface TipCardData {
  type: 'tip_card';
  tipType: 'budget' | 'saving' | 'habit' | 'security' | 'general';
  title: string;
  message: string;
  actionLabel?: string;
  actionId?: string;
}

export interface BillDetailCardData {
  type: 'bill_detail_card';
  bill: BillRecord;
  showActions?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export interface RecordConfirmCardData {
  type: 'record_confirm_card';
  bill: BillRecord;
  actionId: string;
  similarityWarning?: string;
  duplicateCheck?: { found: boolean; existingId?: string };
}

export interface AggregationResult {
  totalIncome: number;
  totalExpense: number;
  billCount: number;
  byCategory: Record<string, number>;
}

export interface CategoryTrend {
  category: string;
  currentAmount: number;
  previousAmount: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
}

export interface AnomalyReport {
  billId: string;
  anomalyType: 'amount_spike' | 'high_frequency' | 'unusual_merchant' | 'duplicate';
  severity: 'low' | 'medium' | 'high';
  detail: string;
  suggestedAction: string;
}

export interface MerchantSummary {
  merchant: string;
  totalAmount: number;
  count: number;
  avgAmount: number;
  lastDate: string;
}

export interface YearlyComparison {
  year: number;
  totalIncome: number;
  totalExpense: number;
  monthBreakdown: { month: number; income: number; expense: number }[];
}

export interface NetBalance {
  totalAssets: number;
  totalDebt: number;
  netWorth: number;
  cashBalance: number;
}

export interface BudgetLimit {
  category: string;
  limit: number;
  period: 'monthly' | 'weekly';
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  createdAt: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  progress: number;
  maxProgress: number;
  unlockedAt?: string;
}

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  totalDays: number;
  lastRecordDate: string;
}

export interface SafetyCheckResult {
  passed: boolean;
  riskLevel: 'safe' | 'caution' | 'danger';
  issues: SafetyIssue[];
  suggestedActions: string[];
}

export interface SafetyIssue {
  type: string;
  severity: 'low' | 'medium' | 'high';
  detail: string;
  relatedBillId?: string;
}

export interface RecurringTask {
  id: string;
  name: string;
  type: 'reminder' | 'backup' | 'report';
  cron: string;
  enabled: boolean;
  lastTriggered?: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  agent: AgentId;
  tool: string;
  action: string;
  params: string;
  resultStatus: 'success' | 'error' | 'rejected' | 'timeout';
  userConfirmed: boolean;
  errorCode?: string;
}

export interface IntentResult {
  intent: string;
  params: Record<string, unknown>;
  confidence: number;
  agent: string;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  errorCode?: string;
}

export type NotificationScenarioType =
  | 'bookkeeping_reminder'
  | 'budget_overrun'
  | 'backup_failure'
  | 'inactive_3days'
  | 'achievement_unlock';

export interface BudgetOverrunAlert {
  category: string;
  limit: number;
  spent: number;
  percentUsed: number;
  severity: 'warning' | 'overrun';
  message: string;
}

export interface NotificationScenario {
  type: NotificationScenarioType;
  title: string;
  body: string;
  priority: 'normal' | 'high' | 'critical';
  shouldTrigger: boolean;
  data?: Record<string, unknown>;
}

export interface ProactiveFindings {
  timestamp: string;
  budgetAlerts: BudgetOverrunAlert[];
  inactivityAlert: { daysSinceLastRecord: number; shouldNotify: boolean } | null;
  upcomingAchievements: { name: string; progress: number; maxProgress: number; percent: number }[];
  savingsUpdates: { name: string; currentAmount: number; targetAmount: number; percent: number; onTrack: boolean }[];
  insights: string[];
}

export interface ShortcutRecord {
  id: string;
  name: string;
  action: string;
  icon: string;
  createdAt: string;
}

export interface AgentMessage {
  messageId: string;
  timestamp: string;
  source: AgentId;
  target: AgentId | 'broadcast';
  replyTo?: string;
  type: string;
  payload: Record<string, unknown>;
  priority: 'normal' | 'high' | 'critical';
  traceId: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  permissionLevel: PermissionLevel;
  parameters: ToolParameter[];
  returns: ToolReturn;
  timeout: number;
  retryable: boolean;
  idempotent: boolean;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  default?: unknown;
}

export interface ToolReturn {
  type: string;
  description: string;
}

export interface PersonaParams {
  rigor: number;
  humor: number;
  proactivity: number;
}

export interface UserPreferences {
  currency: string;
  language: string;
  theme: 'dark' | 'light';
  firstDayOfWeek: 0 | 1;
}

export interface BudgetLimits {
  categories: BudgetLimit[];
}

export interface SafetyConfig {
  anomalySpikeMultiplier: number;
  highFrequencyThreshold: number;
  highFrequencyWindowMinutes: number;
  maxToolsPerRequest: number;
  autoMeltdownErrors: number;
  meltdownTimeWindowMinutes: number;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  tag: string;
  message: string;
  detail?: string;
  data?: unknown;
}
