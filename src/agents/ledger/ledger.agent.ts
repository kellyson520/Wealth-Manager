import { IntentResult, ToolResult, AgentId } from '../../shared/types';
import { add_bill, search_bills } from '../../tools/bills/bills.tool';
import { get_aggregation } from '../../tools/stats/stats.tool';
import { preActionCheck } from '../guardian/guardian.agent';
import {
  canCallTool,
  rememberThis,
  rememberMoment,
  getTool,
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
    case 'list_assets':
      return handleListAssets(intent.params);
    case 'list_debts':
      return handleListDebts(intent.params);
    case 'add_tag':
      return handleAddTag(intent.params);
    case 'add_asset':
      return handleAddAsset(intent.params);
    case 'add_debt':
      return handleAddDebt(intent.params);
    case 'import_bills':
      return handleImportBills(intent.params);
    case 'reimbursement':
      return handleReimbursement(intent.params);
    case 'credit_card':
      return handleCreditCard(intent.params);
    case 'transfer_asset':
      return handleTransferAsset(intent.params);
    case 'settle':
      return handleSettleReimbursement(intent.params);
    case 'ocr_import':
      return handleOCRImport(intent.params);
    case 'greeting':
      return '\u60a8\u597d\uff01\u6211\u662f\u60a8\u7684\u8d22\u52a1\u52a9\u624b \uD83D\uDCB0\n\n\u60a8\u53ef\u4ee5\u8fd9\u6837\u4f7f\u7528\uff1a\n\u2022 "\u5348\u996d\u82b1\u4e8635\u5757" \u2014 \u8bb0\u8d26\n\u2022 "\u4eca\u5929\u82b1\u4e86\u591a\u5c11\uff1f" \u2014 \u67e5\u770b\u6c47\u603b\n\u2022 "\u67e5\u4e00\u4e0b\u9910\u996e\u6d88\u8d39" \u2014 \u641c\u7d22\u8d26\u5355\n\u2022 "\u5de5\u8d44\u5230\u8d265000" \u2014 \u8bb0\u5f55\u6536\u5165';
    default:
      return '\u62b1\u6b49\uff0c\u6211\u8fd8\u4e0d\u592a\u7406\u89e3\u60a8\u7684\u610f\u601d\u3002\u60a8\u53ef\u4ee5\u8bf4"\u5348\u996d\u82b1\u4e8635\u5757"\u6765\u8bb0\u8d26\uff0c\u6216\u8005"\u4eca\u5929\u82b1\u4e86\u591a\u5c11"\u6765\u67e5\u770b\u6c47\u603b\u3002';
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

  const category = await guessCategory(merchant);
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

  const bills = result.data as { merchant: string; amount: number; type: string; date: string }[];
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

async function guessCategory(merchant: string): Promise<string> {
  try {
    const rulesTool = getTool('rules_guess');
    if (rulesTool) {
      const result = await rulesTool.handler({ merchant });
      if (result?.success && result.data) {
        const data = result.data as { category: string; confidence: number };
        if (data.confidence >= 0.3 && data.category !== '其他') {
          return data.category;
        }
      }
    }
  } catch {
    // Fall through to hardcoded fallback
  }

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

async function handleListAssets(params: Record<string, unknown>): Promise<string> {
  const tool = getTool('list_assets');
  if (!tool) return '资产查询功能暂不可用。';
  const result = await tool.handler(params);
  if (!result.success || !result.data) {
    return '查询资产时出错，请重试。';
  }
  const assets = result.data as { name: string; type: string; amount: number }[];
  if (!Array.isArray(assets) || assets.length === 0) {
    return '目前没有记录任何资产。你可以说"添加资产 银行存款 50000"。';
  }
  let reply = '资产列表：\n';
  for (const a of assets) {
    reply += `${a.type} ${a.name}: ${a.amount.toFixed(2)}\n`;
  }
  return reply;
}

async function handleListDebts(params: Record<string, unknown>): Promise<string> {
  const tool = getTool('list_debts');
  if (!tool) return '债务查询功能暂不可用。';
  const result = await tool.handler(params);
  if (!result.success || !result.data) {
    return '查询债务时出错，请重试。';
  }
  const debts = result.data as { title: string; type: string; remaining: number; counterparty: string }[];
  if (!Array.isArray(debts) || debts.length === 0) {
    return '目前没有记录任何债务。';
  }
  let reply = '债务列表：\n';
  for (const d of debts) {
    const label = d.type === '借出' ? '借出给' : '向';
    reply += `${label} ${d.counterparty}: ${d.title} (剩余 ${d.remaining})\n`;
  }
  return reply;
}

async function handleAddTag(params: Record<string, unknown>): Promise<string> {
  const tool = getTool('add_tag');
  if (!tool) return '标签功能暂不可用。';
  const name = params.name;
  if (!name || typeof name !== 'string') return '请告诉我标签名称。';
  const result = await tool.handler({ name });
  if (result.success) return `已创建标签 "${name}"`;
  return `创建标签失败: ${result.error}`;
}

async function handleAddAsset(params: Record<string, unknown>): Promise<string> {
  const tool = getTool('add_asset');
  if (!tool) return '资产功能暂不可用。';
  if (!params.name) return '请告诉我资产名称和金额，例如"添加资产 银行存款 50000"。';
  const result = await tool.handler({ name: params.name, amount: params.amount || 0, type: params.type });
  if (result.success) return `已添加资产 "${params.name}" ${params.amount || ''}`;
  return `添加资产失败: ${result.error}`;
}

async function handleAddDebt(params: Record<string, unknown>): Promise<string> {
  const tool = getTool('add_debt');
  if (!tool) return '债务功能暂不可用。';
  if (!params.title) return '请告诉我债务详情，例如"添加债务 借给张三 5000"。';
  const result = await tool.handler({
    title: params.title,
    type: params.type || '借出',
    principal: params.principal || params.amount || 0,
    counterparty: params.counterparty || params.title,
    dueDate: params.dueDate,
    note: params.note,
  });
  if (result.success) return `已记录债务 "${params.title}"`;
  return `记录债务失败: ${result.error}`;
}

async function handleImportBills(params: Record<string, unknown>): Promise<string> {
  const rawText = typeof params.rawText === 'string' ? params.rawText.trim() : '';
  if (rawText) {
    const tool = getTool('ocr_import');
    if (!tool) return '导入功能暂不可用。';
    const normalizedText = normalizeInlineBillText(rawText);
    const result = await tool.handler({ rawText: normalizedText, source: 'text' });
    if (result.success && result.data) {
      const data = result.data as { importedCount: number; imported?: { merchant: string; amount: number }[] };
      if (data.importedCount > 0) {
        const preview = (data.imported || [])
          .slice(0, 3)
          .map((bill) => `${bill.merchant} ¥${bill.amount.toFixed(2)}`)
          .join('，');
        return `已导入 ${data.importedCount} 条账单${preview ? `：${preview}` : ''}`;
      }
      return '没有从这段文本中识别到账单。请按“日期 商户 金额”的格式粘贴，例如“2026-06-01 滴滴 28.5”。';
    }
    return `导入账单失败：${result.error}`;
  }

  const tool = getTool('get_import_history');
  if (!tool) return '导入功能暂不可用。';
  const result = await tool.handler({ limit: 10 });
  if (result.success && result.data) {
    const history = result.data as { date: string; count: number }[];
    if (history.length === 0) return '暂无导入记录。您可以通过"导入微信账单"导入数据。';
    return `最近导入记录:\n${history.map((h) => `${h.date}: ${h.count}笔`).join('\n')}`;
  }
  return '查询导入历史失败。';
}

function normalizeInlineBillText(rawText: string): string {
  return rawText
    .split(/[；;\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2})\s+(.+?)\s+(\d+(?:\.\d{1,2})?)$/);
      if (!match) return entry;
      const [, date, merchant, amount] = match;
      return `${merchant.trim()} - ${amount} ${date.replace(/\//g, '-')}`;
    })
    .join('\n');
}

async function handleReimbursement(params: Record<string, unknown>): Promise<string> {
  const tool = getTool('create_reimbursement');
  if (!tool) return '报销功能暂不可用。';
  if (!params.title) return '请告诉我报销内容，例如"创建报销 差旅费 1200"。';
  const result = await tool.handler({
    title: params.title,
    amount: params.amount || 0,
    category: params.category,
  });
  if (result.success) return `已创建报销 "${params.title}" ${params.amount ? `¥${params.amount}` : ''}`;
  return `创建报销失败: ${result.error}`;
}

async function handleCreditCard(params: Record<string, unknown>): Promise<string> {
  const tool = getTool('add_credit_card');
  if (!tool) return '信用卡功能暂不可用。';
  if (!params.name || !params.bank) return '请告诉我信用卡名称和发卡行，如"添加信用卡 招行 50000"。';
  const result = await tool.handler({
    name: params.name,
    bank: params.bank,
    creditLimit: params.creditLimit || params.amount || 0,
    billDay: params.billDay,
    paymentDay: params.paymentDay,
  });
  if (result.success) return `已添加信用卡 "${params.bank} ${params.name}"`;
  return `添加信用卡失败: ${result.error}`;
}

async function handleTransferAsset(params: Record<string, unknown>): Promise<string> {
  const tool = getTool('transfer_asset');
  if (!tool) return '转账功能暂不可用。';
  const result = await tool.handler({
    fromAssetId: params.fromAssetId || params.from,
    toAssetId: params.toAssetId || params.to,
    amount: params.amount,
  });
  if (result.success) {
    const data = result.data as { from: { name: string }, to: { name: string }, amount: number };
    return `已从 "${data.from.name}" 转入 "${data.to.name}" ${data.amount}元`;
  }
  return `转账失败: ${result.error}`;
}

async function handleSettleReimbursement(params: Record<string, unknown>): Promise<string> {
  const tool = getTool('settle_reimbursement');
  if (!tool) return '报销结算功能暂不可用。';
  const result = await tool.handler({ taskId: params.taskId || params.id });
  if (result.success) return `报销已结算`;
  return `结算失败: ${result.error}`;
}

async function handleOCRImport(params: Record<string, unknown>): Promise<string> {
  const tool = getTool('ocr_import');
  if (!tool) return 'OCR导入功能暂不可用。';
  const result = await tool.handler({ rawText: params.rawText || params.text, source: 'ocr' });
  if (result.success) {
    const data = result.data as { importedCount: number };
    return `已从OCR文本导入 ${data.importedCount} 条账单`;
  }
  return `OCR导入失败: ${result.error}`;
}

function getCategoryEmoji(cat: string): string {
  const map: Record<string, string> = {
    '餐饮': '🍜', '交通': '🚗', '购物': '🛒', '住房': '🏠',
    '娱乐': '🎮', '医疗': '💊', '教育': '📚', '水电': '💡',
    '其他': '📦', '工资': '💰', '奖金': '🎁', '投资': '📈',
  };
  return map[cat] || '📦';
}
