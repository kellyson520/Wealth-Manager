import { IntentResult, ToolResult, AgentId } from '../../shared/types';
import { add_bill, search_bills } from '../../tools/bills/bills.tool';
import { get_aggregation } from '../../tools/stats/stats.tool';
import { preActionCheck } from '../guardian/guardian.agent';
import {
  getSecurityProfile,
  canCallTool,
  rememberThis,
  rememberMoment,
  recallMemory,
  getDelegationTargets,
  createAgentMessage,
} from '../_shared';

const AGENT_ID: AgentId = 'ledger';

export async function handleIntent(intent: IntentResult): Promise<string> {
  switch (intent.intent) {
    case 'add_expense':
      return handleAddExpense(intent.params);
    case 'add_income':
      return handleAddIncome(intent.params);
    case 'search_bills':
      return handleSearchBills(intent.params);
    case 'get_summary':
      return handleGetSummary(intent.params);
    case 'greeting':
      return '您好！我是您的财务助手 💰\n\n您可以这样使用：\n• "午饭花了35块" — 记账\n• "今天花了多少？" — 查看汇总\n• "查一下餐饮消费" — 搜索账单\n• "工资到账5000" — 记录收入';
    default:
      return '抱歉，我还不太理解您的意思。您可以说"午饭花了35块"来记账，或者"今天花了多少"来查看汇总。';
  }
}

async function handleAddExpense(params: Record<string, unknown>): Promise<string> {
  const amount = params.amount as number;
  const merchant = (params.merchant as string) || '消费';

  if (!amount || amount <= 0) {
    return '请告诉我具体金额，比如"午饭花了35块"。';
  }

  const toolCheck = canCallTool(AGENT_ID, 'add_bill');
  if (!toolCheck.allowed) {
    return `操作被拒绝：${toolCheck.reason}`;
  }

  const safetyCheck = await preActionCheck({ amount, merchant });
  if (!safetyCheck.safe) {
    return safetyCheck.message || '安全预检未通过，操作已阻止。';
  }

  const category = guessCategory(merchant);
  const result: ToolResult = await add_bill({
    amount,
    type: 'expense',
    merchant: merchant || '消费',
    category,
  });

  if (result.success) {
    await rememberThis(AGENT_ID, `分类映射:${merchant}→${category}`);
    await rememberMoment(AGENT_ID, `支出:${merchant} ¥${amount.toFixed(2)}`);
    const warningMsg = safetyCheck.message ? `\n💡 ${safetyCheck.message}` : '';
    return `已记录 💸 ${merchant} ¥${amount.toFixed(2)}${warningMsg}`;
  }
  return `记账失败：${result.error}，请重试。`;
}

async function handleAddIncome(params: Record<string, unknown>): Promise<string> {
  const amount = params.amount as number;
  const merchant = (params.merchant as string) || '收入';

  if (!amount || amount <= 0) {
    return '请告诉我具体金额，比如"工资到账5000"。';
  }

  const toolCheck = canCallTool(AGENT_ID, 'add_bill');
  if (!toolCheck.allowed) {
    return `操作被拒绝：${toolCheck.reason}`;
  }

  const safetyCheck = await preActionCheck({ amount, merchant });
  if (!safetyCheck.safe) {
    return safetyCheck.message || '安全预检未通过，操作已阻止。';
  }

  const result: ToolResult = await add_bill({
    amount,
    type: 'income',
    merchant,
    category: '工资',
  });

  if (result.success) {
    await rememberMoment(AGENT_ID, `收入:${merchant} ¥${amount.toFixed(2)}`);
    const warningMsg = safetyCheck.message ? `\n💡 ${safetyCheck.message}` : '';
    return `已记录 💰 ${merchant} ¥${amount.toFixed(2)}${warningMsg}`;
  }
  return `记账失败：${result.error}，请重试。`;
}

async function handleSearchBills(params: Record<string, unknown>): Promise<string> {
  const keyword = params.keyword as string;
  const period = params.period as string;

  const searchParams: Record<string, unknown> = { limit: 10 };
  if (keyword) searchParams.keyword = keyword;
  if (period === 'today') {
    searchParams.startDate = new Date().toISOString().split('T')[0];
  } else if (period === 'month') {
    searchParams.startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split('T')[0];
  }

  const result = await search_bills(searchParams);
  if (!result.success || !Array.isArray(result.data)) {
    return '查询账单时出现问题，请重试。';
  }

  const bills = result.data as Array<{ merchant: string; amount: number; type: string; date: string }>;
  if (bills.length === 0) {
    return '没有找到相关账单。';
  }

  let reply = '找到以下账单：\n';
  for (let i = 0; i < Math.min(bills.length, 5); i++) {
    const b = bills[i];
    const emoji = b.type === 'income' ? '💰' : '💸';
    reply += `${emoji} ${b.date} ${b.merchant} ¥${b.amount.toFixed(2)}\n`;
  }
  if (bills.length > 5) {
    reply += `... 共 ${bills.length} 条记录`;
  }
  return reply;
}

async function handleGetSummary(params: Record<string, unknown>): Promise<string> {
  const period = (params.period as string) || 'today';
  const result = await get_aggregation({ period: period as 'today' | 'week' | 'month' });
  if (!result.success || !result.data) {
    return '获取汇总时出现问题，请重试。';
  }

  const data = result.data as { totalIncome: number; totalExpense: number; billCount: number; byCategory: Record<string, number> };
  const periodLabel = period === 'today' ? '今日' : period === 'week' ? '本周' : '本月';

  let reply = `📊 **${periodLabel}概览**\n\n`;
  reply += `💰 收入：¥${data.totalIncome.toFixed(2)}\n`;
  reply += `💸 支出：¥${data.totalExpense.toFixed(2)}\n`;
  reply += `📝 共 ${data.billCount} 笔账单\n`;

  if (data.totalExpense > 0) {
    reply += `\n结余：¥${(data.totalIncome - data.totalExpense).toFixed(2)}\n`;
  }

  if (Object.keys(data.byCategory).length > 0) {
    reply += '\n支出分类：\n';
    const entries = Object.entries(data.byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    for (const [cat, amount] of entries) {
      reply += `  ${getCategoryEmoji(cat)} ${cat}：¥${amount.toFixed(2)}\n`;
    }
  }

  return reply;
}

function guessCategory(merchant: string): string {
  const foodTerms = ['饭', '餐', '面', '菜', '奶茶', '咖啡', '外卖', '食堂', '餐厅', '火锅', '烧烤', '水果'];
  const transportTerms = ['地铁', '公交', '打车', '滴滴', '出租', '油', '停车', '高铁', '机票'];
  const shopTerms = ['淘宝', '京东', '拼多多', '超市', '商场', '衣服', '鞋'];

  for (const term of foodTerms) {
    if (merchant.includes(term)) return '餐饮';
  }
  for (const term of transportTerms) {
    if (merchant.includes(term)) return '交通';
  }
  for (const term of shopTerms) {
    if (merchant.includes(term)) return '购物';
  }
  return '其他';
}

function getCategoryEmoji(cat: string): string {
  const map: Record<string, string> = {
    '餐饮': '🍜', '交通': '🚗', '购物': '🛒', '住房': '🏠',
    '娱乐': '🎮', '医疗': '💊', '教育': '📚', '水电': '💡',
    '其他': '📦', '工资': '💰', '奖金': '🎁', '投资': '📈',
  };
  return map[cat] || '📦';
}
