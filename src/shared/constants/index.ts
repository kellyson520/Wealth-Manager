import type { BillType, AgentId, PermissionLevel } from '../types';

export const APP_NAME = 'Wealth Manager';
export const APP_VERSION = '0.1.0';
export const APP_DESCRIPTION = 'AI 原生对话式记账系统';

export const CATEGORY_EMOJI: Record<string, string> = {
  '餐饮': '🍜', '交通': '🚗', '购物': '🛒', '住房': '🏠',
  '娱乐': '🎮', '医疗': '💊', '教育': '📚', '水电': '💡',
  '其他': '📦', '工资': '💰', '奖金': '🎁', '投资': '📈',
  '兼职': '💼',
};

export const AGENT_NAMES: Record<AgentId, string> = {
  master: 'Master',
  ledger: 'Ledger',
  analyst: 'Analyst',
  coach: 'Coach',
  guardian: 'Guardian',
};

export const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  0: '只读安全',
  1: '数据写入',
  2: '敏感操作',
};

export const DEFAULT_CURRENCY = 'CNY';
export const DEFAULT_LANGUAGE = 'zh-Hans';
export const DEFAULT_THEME = 'dark';

export const LEVEL_TITLES: Record<number, string> = {
  1: '记账新手',
  2: '小小管家',
  3: '理财能手',
  4: '财务达人',
  5: '资深玩家',
  6: '财富大师',
  7: '记账王者',
  8: '传奇富翁',
};

export const LEVEL_EXP_THRESHOLDS: Record<number, number> = {
  1: 0,
  2: 10,
  3: 50,
  4: 100,
  5: 300,
  6: 500,
  7: 1000,
  8: 2000,
};

export const MAX_BILL_AMOUNT = 99999999;
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_TOOLS_PER_REQUEST = 5;
export const MAX_RETRY_COUNT = 3;
export const DEFAULT_TOOL_TIMEOUT = 5000;
export const VECTOR_DIM = 128;

export const EXPENSE_CATEGORIES = ['餐饮', '交通', '购物', '住房', '娱乐', '医疗', '教育', '水电', '其他'] as const;
export const INCOME_CATEGORIES = ['工资', '奖金', '投资', '兼职', '其他收入'] as const;
export const ASSET_TYPES = ['现金', '银行账户', '股票', '基金', '房产', '车辆', '债权', '其他'] as const;
export const BILL_TYPES: BillType[] = ['income', 'expense', 'refund'];
