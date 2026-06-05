import { IntentResult } from '../../shared/types';
import { applyLearnedIntent } from './nlu-learning';

const BUDGET_PAIR_PATTERN = /([\u4e00-\u9fa5A-Za-z]{1,16})预算(?:设成|设置为|设为|调整为|调到|定为|是|为)?\s*(\d+(?:\.\d{1,2})?)/g;
const CHINESE_NUMERAL_PATTERN = /[零〇一二两三四五六七八九十百千万]+/;

function cleanupCategory(raw: string): string {
  return raw
    .replace(/^(?:把|将|给|帮我|请|设置|设定|调整|新增|添加|预算)+/, '')
    .replace(/[，。,.、\s]/g, '')
    .trim();
}

function extractBudgets(text: string): { category: string; limit: number }[] {
  const budgets: { category: string; limit: number }[] = [];
  for (const match of text.matchAll(BUDGET_PAIR_PATTERN)) {
    const category = cleanupCategory(match[1]);
    const limit = parseFloat(match[2]);
    if (category && limit > 0) {
      budgets.push({ category, limit });
    }
  }
  return budgets;
}

function extractAmount(text: string): number {
  const match = text.match(/(\d+(?:\.\d{1,2})?)\s*万/);
  if (match) return parseFloat(match[1]) * 10000;
  const numMatch = text.match(/(\d+(?:\.\d{1,2})?)/);
  if (numMatch) return parseFloat(numMatch[1]);
  const chineseMatch = text.match(CHINESE_NUMERAL_PATTERN);
  return chineseMatch ? parseChineseAmount(chineseMatch[0]) : 0;
}

function parseAmountValue(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[元块钱,\s]/g, '');
  const numericWan = cleaned.match(/^(\d+(?:\.\d{1,2})?)万$/);
  if (numericWan) return parseFloat(numericWan[1]) * 10000;
  const numeric = cleaned.match(/\d+(?:\.\d{1,2})?/);
  if (numeric) return parseFloat(numeric[0]);
  const chinese = cleaned.match(CHINESE_NUMERAL_PATTERN);
  return chinese ? parseChineseAmount(chinese[0]) : 0;
}

function parseChineseAmount(text: string): number {
  const digitMap: Record<string, number> = {
    零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
    六: 6, 七: 7, 八: 8, 九: 9,
  };

  const parseBelowWan = (part: string): number => {
    if (!part) return 0;
    let total = 0;
    let current = 0;
    for (const char of part) {
      const digit = digitMap[char];
      if (digit !== undefined) {
        current = digit;
      } else if (char === '十') {
        total += (current || 1) * 10;
        current = 0;
      } else if (char === '百') {
        total += (current || 1) * 100;
        current = 0;
      } else if (char === '千') {
        total += (current || 1) * 1000;
        current = 0;
      }
    }
    return total + current;
  };

  const wanIndex = text.indexOf('万');
  if (wanIndex >= 0) {
    const high = parseBelowWan(text.slice(0, wanIndex)) || 1;
    const lowText = text.slice(wanIndex + 1);
    let low = parseBelowWan(lowText);
    if (lowText.length === 1 && low > 0) low *= 1000;
    return high * 10000 + low;
  }

  const value = parseBelowWan(text);
  if (/[千百十]/.test(text)) return value;
  if (text.length === 2) return (digitMap[text[0]] || 0) * 10 + (digitMap[text[1]] || 0);
  return value;
}

function normalizeDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function extractRelativeDate(text: string): string | undefined {
  const now = new Date();
  if (text.includes('昨天') || text.includes('昨晚')) {
    return normalizeDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  }
  if (text.includes('今天') || text.includes('刚才')) {
    return normalizeDate(now);
  }
  const nextMonthMatch = text.match(/下个月\s*(\d{1,2})[号日]/);
  if (nextMonthMatch) {
    return normalizeDate(new Date(now.getFullYear(), now.getMonth() + 1, parseInt(nextMonthMatch[1], 10)));
  }
  const monthDayMatch = text.match(/(\d{1,2})月\s*(\d{1,2})[号日]/);
  if (monthDayMatch) {
    const month = parseInt(monthDayMatch[1], 10) - 1;
    const day = parseInt(monthDayMatch[2], 10);
    const candidate = new Date(now.getFullYear(), month, day);
    if (candidate.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
      candidate.setFullYear(candidate.getFullYear() + 1);
    }
    return normalizeDate(candidate);
  }
  const dayMatch = text.match(/(?:本月|这个月|下次)?\s*(\d{1,2})[号日](?:还|归还|还款)?/);
  if (dayMatch) {
    const day = parseInt(dayMatch[1], 10);
    const candidate = new Date(now.getFullYear(), now.getMonth(), day);
    if (candidate.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
      candidate.setMonth(candidate.getMonth() + 1);
    }
    return normalizeDate(candidate);
  }
  return undefined;
}

function extractDeleteKeyword(text: string): string | undefined {
  const beforeDelete = text.match(/(?:昨天|昨晚|今天|刚才|上次|最近)?\s*([^，。,.！？\s]{2,20})(?:那笔|这笔|那条|这条|账单|记录).*(?:删|删除|移除|撤销)/);
  if (beforeDelete) return beforeDelete[1].trim();

  const afterDelete = text.match(/(?:删除|删掉|删了|移除|撤销).{0,6}?([^，。,.！？\s]{2,20})(?:那笔|这笔|账单|记录|消费)?/);
  if (afterDelete) return afterDelete[1].trim();

  return undefined;
}

function inferAssetType(text: string): string {
  if (/(银行|存款|活期|余额|账户|卡)/.test(text)) return '银行账户';
  if (/股票/.test(text)) return '股票';
  if (/基金/.test(text)) return '基金';
  if (/房|房产/.test(text)) return '房产';
  if (/车|车辆/.test(text)) return '车辆';
  if (/现金/.test(text)) return '现金';
  return '其他';
}

function extractAssetList(text: string): { name: string; amount: number; type: string }[] {
  const assets: { name: string; amount: number; type: string }[] = [];
  const segments = text.split(/[；;]/).map((s) => s.trim()).filter(Boolean);
  for (const segment of segments) {
    const match = segment.match(/([^，。,.！？\s]+?)(?:余额|存款|市值|资产)(?:还有|还剩|是|为)?\s*(\d+(?:\.\d{1,2})?\s*万?)/);
    if (!match) continue;
    const name = match[1].trim();
    const amount = extractAmount(match[2]);
    if (name && amount > 0) {
      assets.push({ name, amount, type: inferAssetType(segment) });
    }
  }
  return assets;
}

function extractAssetParams(text: string): Record<string, unknown> {
  const assets = extractAssetList(text);
  if (assets.length > 0) {
    return {
      name: assets[0].name,
      amount: assets[0].amount,
      type: assets[0].type,
      assets,
    };
  }

  const amount = extractAmount(text);
  let name = '';

  const valueMatch = text.match(/(?:添加|增加|新增|记录|录入)?\s*([^，。,.！？\s]+?)(?:，|,|\s)*(?:价值|估值|值)\s*\d/);
  if (valueMatch) {
    name = valueMatch[1].trim();
  }

  const balanceMatch = text.match(/(?:我(?:的)?|把|将)?\s*([^，。,.！？\s]+?)(?:余额|存款|市值|资产)\s*\d/);
  if (!name && balanceMatch) {
    name = balanceMatch[1].trim();
    if (text.includes('活期') && !name.includes('活期')) name += '活期';
  }

  if (!name) {
    const addMatch = text.match(/(?:添加|增加|新增|记录|录入).{0,6}(?:资产)?\s*([^，。,.！？\d]+?)\s*\d/);
    if (addMatch) name = addMatch[1].trim();
  }

  if (!name) {
    name = text
      .replace(/(?:帮我|请|把|将|添加|增加|新增|记录|录入|加到资产里|资产|余额|金额)/g, '')
      .replace(/\d+(?:\.\d{1,2})?/g, '')
      .replace(/[，。,.！？\s]/g, '')
      .trim();
  }

  return {
    name: name || '资产',
    amount,
    type: inferAssetType(text),
  };
}

function extractCreditCardParams(text: string): Record<string, unknown> {
  const amount = extractAmount(text);
  const cardText = text.match(/信用卡\s*([^额度，。,.！？\s]+)额度/)?.[1] || '';
  const knownBanks = ['招商', '招行', '工商', '建设', '农业', '中国', '交通', '浦发', '民生', '兴业', '中信', '广发', '平安', '光大', '华夏'];
  const matchedBank = knownBanks.find((bank) => cardText.startsWith(bank));
  const bankMatch = text.match(/(?:信用卡)?\s*([\u4e00-\u9fa5A-Za-z]{2,8})(?:银行)?([\u4e00-\u9fa5A-Za-z0-9]{0,12}?卡)?(?:额度|信用额度)/);
  const compactMatch = text.match(/信用卡\s*([\u4e00-\u9fa5A-Za-z]{2,8})([\u4e00-\u9fa5A-Za-z0-9]{1,12})?额度/);
  const addMatch = text.match(/(?:添加|绑定|录入)?\s*信用卡\s*([\u4e00-\u9fa5A-Za-z]{2,8})\s*\d/);
  const billDay = text.match(/账单日\s*(\d{1,2})[号日]?/)?.[1];
  const paymentDay = text.match(/(?:还款日|还款)\s*(\d{1,2})[号日]?/)?.[1];

  const bank = matchedBank ? (matchedBank === '招行' ? '招商' : matchedBank) : bankMatch?.[1] || compactMatch?.[1] || addMatch?.[1] || '';
  const name = matchedBank
    ? cardText.slice(matchedBank.length) || '信用卡'
    : (bankMatch?.[2] || compactMatch?.[2] || '信用卡').replace(/^银行/, '') || '信用卡';

  return {
    bank,
    name,
    creditLimit: amount,
    amount,
    billDay: billDay ? parseInt(billDay, 10) : undefined,
    paymentDay: paymentDay ? parseInt(paymentDay, 10) : undefined,
  };
}

function extractModifyBillParams(text: string): Record<string, unknown> {
  const billId = text.match(/(?:账单|记录|id|ID)\s*([0-9a-f-]{8,36})/i)?.[1];
  const category = text.match(/(?:改成|改为|调整为|分类为|设为)\s*(餐饮|交通|购物|娱乐|住房|医疗|教育|水电|其他|工资|奖金|投资)/)?.[1];
  const keyword = text.match(/(?:刚才|上次|最近|今天|昨天)?\s*([^，。,.！？\s]{2,20})(?:那笔|这笔|账单|记录)?.*(?:改成|改为|调整为|分类为|设为)/)?.[1]
    ?.replace(/^(?:那笔|这笔|那条|这条)/, '');
  return {
    billId,
    keyword,
    category,
    date: extractRelativeDate(text),
    confirmed: /确认/.test(text),
  };
}

function extractDebtParams(text: string): Record<string, unknown> {
  const amount = extractAmount(text);
  const amountPattern = '([\\d.]+|[零〇一二两三四五六七八九十百千万]+)';
  const lendMatch = text.match(new RegExp(`(?:借给|借出给)\\s*([\\u4e00-\\u9fa5A-Za-z_]{1,20})\\s*${amountPattern}`));
  if (lendMatch) {
    const counterparty = lendMatch[1];
    const principal = parseAmountValue(lendMatch[2]);
    return {
      title: `借给${counterparty}`,
      type: '借出',
      principal,
      amount: principal,
      counterparty,
      dueDate: extractRelativeDate(text),
    };
  }

  const borrowMatch = text.match(new RegExp(`(?:向|找)\\s*([\\u4e00-\\u9fa5A-Za-z_]{1,20})\\s*(?:借了|借)\\s*${amountPattern}`));
  if (borrowMatch) {
    const counterparty = borrowMatch[1];
    const principal = parseAmountValue(borrowMatch[2]);
    return {
      title: `向${counterparty}借款`,
      type: '借入',
      principal,
      amount: principal,
      counterparty,
      dueDate: extractRelativeDate(text),
    };
  }

  const owedToMeMatch = text.match(new RegExp(`([\\u4e00-\\u9fa5A-Za-z_]{1,20})\\s*欠我\\s*${amountPattern}`));
  if (owedToMeMatch) {
    const counterparty = owedToMeMatch[1];
    const principal = parseAmountValue(owedToMeMatch[2]);
    return {
      title: `${counterparty}欠我`,
      type: '借出',
      principal,
      amount: principal,
      counterparty,
      dueDate: extractRelativeDate(text),
    };
  }

  const oweMatch = text.match(new RegExp(`欠\\s*([\\u4e00-\\u9fa5A-Za-z_]{1,20})\\s*${amountPattern}`));
  if (oweMatch) {
    const counterparty = oweMatch[1];
    const principal = parseAmountValue(oweMatch[2]);
    return {
      title: `欠${counterparty}`,
      type: '借入',
      principal,
      amount: principal,
      counterparty,
      dueDate: extractRelativeDate(text),
    };
  }

  return {
    title: text.replace(/[，。,.！？]/g, '').trim(),
    type: text.includes('借给') || text.includes('借出') ? '借出' : '借入',
    principal: amount,
    amount,
    dueDate: extractRelativeDate(text),
  };
}

function extractReimbursementParams(text: string): Record<string, unknown> {
  const amount = extractAmount(text);
  const title = text
    .replace(/(?:申请|创建|添加|记录|提交|发起)?报销/g, '')
    .replace(/\d+(?:\.\d{1,2})?\s*(?:元|块|块钱)?/g, '')
    .replace(CHINESE_NUMERAL_PATTERN, '')
    .replace(/[，。,.！？:\s]/g, '')
    .trim() || '报销';
  const category = /打车|滴滴|地铁|公交|高铁|机票|交通/.test(text) ? '交通'
    : /餐|饭|咖啡|奶茶|外卖/.test(text) ? '餐饮'
      : undefined;
  return { title, amount, category };
}

const intentPatterns: { intent: string; patterns: RegExp[]; agent: string; priority?: number; extractParams: (match: RegExpMatchArray | null, text: string) => Record<string, unknown> }[] = [
  {
    intent: 'add_expense',
    agent: 'ledger',
    patterns: [
      /(.+?)\s*花[了费]\s*(\d+(?:\.\d{1,2})?)\s*(?:块|元|块钱?)?/,
      /(.+?)\s*(\d+(?:\.\d{1,2})?)\s*(?:块|元|块钱?)(?:花[了费]?)?/,
      /记[一]?笔\s*(.+?)\s*(\d+(?:\.\d{1,2})?)/,
      /支出\s*(.+?)\s*(\d+(?:\.\d{1,2})?)/,
      /花了?\s*(\d+(?:\.\d{1,2})?)\s*(?:块|元)?\s*(.+)/,
    ],
    extractParams: (match, _text) => {
      if (!match) return {};
      let merchant = '';
      let amount = 0;
      for (let i = 1; i < match.length; i++) {
        const v = match[i];
        if (/^\d+(\.\d{1,2})?$/.test(v)) {
          amount = parseFloat(v);
        } else if (v) {
          merchant = v.replace(/[花了费记笔支出]/g, '').trim();
        }
      }
      return { amount, merchant };
    },
  },
  {
    intent: 'add_income',
    agent: 'ledger',
    patterns: [
      /收入?\s*(.+?)\s*(\d+(?:\.\d{1,2})?)/,
      /(?:发工资|工资发了|工资到账|工资|收入|奖金).*?(\d+(?:\.\d{1,2})?\s*万?|[零〇一二两三四五六七八九十百千万]+)/,
      /赚[了到]?\s*(\d+(?:\.\d{1,2})?)\s*(?:块|元)?\s*(.+)?/,
      /工资\s*(\d+(?:\.\d{1,2})?)/,
      /收入?\s*(\d+(?:\.\d{1,2})?)/,
      /到账\s*(\d+(?:\.\d{1,2})?)/,
    ],
    extractParams: (match, _text) => {
      if (!match) return {};
      let amount = 0;
      let merchant = '';
      for (let i = 1; i < match.length; i++) {
        const v = match[i];
        if (/^\d+(\.\d{1,2})?\s*万?$/.test(v) || CHINESE_NUMERAL_PATTERN.test(v)) {
          amount = parseAmountValue(v);
        } else if (v) {
          merchant = v.trim();
        }
      }
      if (!amount) amount = extractAmount(_text);
      return { amount, merchant };
    },
  },
  {
    intent: 'search_bills',
    agent: 'ledger',
    patterns: [
      /^(?:查|查询|查找|查看|找|看看|看下).*(?:账单|记录|消费|支出|收入|花费|开销).*/,
      /.*(?:账单|记录|消费|支出|收入|花费|开销).*(?:在哪里|在哪|哪去了|查一下|找一下).*/,
      /最近.*(?:账单|消费|记录)/,
      /这个月.*(?:账单|记录)/,
      /今天.*(?:账单|记录)/,
      /历史.*(?:账单|记录)/,
    ],
    extractParams: (match, text) => {
      let keyword = match?.[1]?.trim() || '';
      let period = '';
      if (text.includes('今天') || text.includes('今日')) period = 'today';
      else if (text.includes('本周') || text.includes('这周')) period = 'week';
      else if (text.includes('本月') || text.includes('这个月')) period = 'month';
      return { keyword, period };
    },
  },
  {
    intent: 'delete_bill',
    agent: 'guardian',
    priority: 0.2,
    patterns: [
      /.*(?:删掉|删除|删了|移除|撤销).*(?:账单|记录|消费|开销|支出|那笔|这笔|账).*/,
      /.*(?:那笔|这笔|那条|这条).*(?:删掉|删除|删了|移除|撤销).*/,
    ],
    extractParams: (_match, text) => {
      const keyword = extractDeleteKeyword(text);
      const billId = text.match(/(?:账单|记录|id|ID)\s*([0-9a-f-]{8,36})/i)?.[1];
      return {
        billId,
        keyword,
        date: extractRelativeDate(text),
        confirmed: /确认/.test(text),
        requiresConfirmation: !/确认/.test(text),
      };
    },
  },
  {
    intent: 'get_summary',
    agent: 'analyst',
    patterns: [
      /(?:查看|看[看下]?|显示|汇总|统计).*(?:概览|汇总|统计|分析|情况)/,
      /(?:今天|今日|本月|本周).*(?:花了|消费|支出|收入|情况|概览)/,
      /支出?(?:统计|分析|汇总|情况)/,
      /花了多少/,
      /账单?(?:统计|分析|汇总)/,
    ],
    extractParams: (_match, text) => {
      let period = 'today';
      if (text.includes('本月') || text.includes('这个月')) period = 'month';
      else if (text.includes('本周') || text.includes('这周')) period = 'week';
      return { period };
    },
  },
  {
    intent: 'get_category_trend',
    agent: 'analyst',
    priority: 0.05,
    patterns: [
      /.*(?:消费|支出).*(?:趋势|变化|走势).*/,
      /.*(?:餐饮|交通|购物|娱乐|住房|医疗|教育|水电|食品|交通费).*(?:趋势|变化|走势).*/,
      /分类.*(?:趋势|变化|分析)/,
      /趋势.*(?:分析|报告)/,
      /哪个.*(?:分类|类别).*(?:多|少|高|低)/,
      /消费.*(?:趋势|变化)/,
    ],
    extractParams: (_match, text) => {
      const category = text.replace(/[分类趋势变化分析哪个类别多少高低消费分布]/g, '').trim();
      return { category: category || undefined };
    },
  },
  {
    intent: 'get_anomaly',
    agent: 'analyst',
    priority: 0.15,
    patterns: [
      /.*(?:异常消费|消费异常|不正常|可疑消费).*/,
      /(?:异常|可疑).*(?:检测|消费|账单|交易)/,
      /(?:检测|发现).*(?:异常|可疑)/,
      /消费.*(?:异常|不正常|可疑)/,
      /.*(?:比平时|突然|明显).*(?:多花|多花很多|高很多|贵很多).*/,
      /有没有.*(?:异常|可疑|问题)/,
    ],
    extractParams: (_match, text) => {
      let period = 'month';
      if (text.includes('本周') || text.includes('这周')) period = 'week';
      else if (text.includes('今天') || text.includes('今日')) period = 'today';
      return { period };
    },
  },
  {
    intent: 'get_merchants',
    agent: 'analyst',
    patterns: [
      /(?:商家|商户).*(?:排行|汇总|总结|排名)/,
      /(?:最常|经常|总是).*(?:商店|店|商家|商户|消费)/,
      /哪个.*(?:超市|商店|店|商家|商户).*(?:最多|最常|经常)/,
      /(?:在哪|哪儿|哪里).*(?:花|消费)/,
      /(?:经常|总).*(?:去哪|在哪).*(?:花|消费)/,
    ],
    extractParams: (_match, text) => {
      let period = 'month';
      if (text.includes('本周') || text.includes('这周')) period = 'week';
      else if (text.includes('今天') || text.includes('今日')) period = 'today';
      return { period, limit: 10 };
    },
  },
  {
    intent: 'get_yearly',
    agent: 'analyst',
    patterns: [
      /年度.*(?:对比|统计|分析|总结)/,
      /今年.*(?:收支|收入|支出)/,
      /去年.*(?:收支|收入|支出|消费|花了|多少)/,
      /\d{4}年.*(?:收支|统计)/,
      /过去.*(?:一年|12个月)/,
    ],
    extractParams: (_match, text) => {
      const yearMatch = text.match(/(\d{4})年/);
      const currentYear = new Date().getFullYear();
      return { year: yearMatch ? parseInt(yearMatch[1]) : text.includes('去年') ? currentYear - 1 : currentYear };
    },
  },
  {
    intent: 'get_chart',
    agent: 'analyst',
    priority: 0.35,
    patterns: [
      /.*(?:消费|支出).*(?:趋势|变化|走势).*(?:图|图表|可视化).*/,
      /.*(?:图|图表|可视化).*(?:消费|支出).*(?:趋势|变化|走势).*/,
      /.*(?:图|图表|可视化).*(?:消费|支出|收入|分布|对比).*/,
      /(?:画|生成|显示|看看|看).*(?:消费|支出|收入|预算)?.*(?:图|图表|对比图).*/,
      /(?:生成|画|显示|看).*(?:图表|饼图|折线|柱状)/,
      /(?:图表|饼图|折线图|柱状图|chart)/i,
      /可视化.*(?:消费|账单|收入)/,
    ],
    extractParams: (_match, text) => {
      let chartType = 'pie';
      if (text.includes('折线') || text.includes('趋势')) chartType = 'line';
      else if (text.includes('柱') || text.includes('对比')) chartType = 'bar';
      else if (text.includes('仪表') || text.includes('预算')) chartType = 'gauge';
      let period = 'month';
      if (text.includes('本周') || text.includes('这周')) period = 'week';
      else if (text.includes('今天') || text.includes('今日')) period = 'today';
      return { chartType, period };
    },
  },
  {
    intent: 'get_budget_status',
    agent: 'analyst',
    patterns: [
      /预算.*(?:状态|情况|执行|使用)/,
      /(?:预算|额度).*(?:还剩|剩余|剩多少|多少)/,
      /预算.*(?:超支|超标|够不够)/,
      /(?:还剩|剩余).*(?:预算|额度)/,
      /(?:哪些|哪个).*(?:预算|超标)/,
    ],
    extractParams: (_match, text) => {
      const catMatch = text.match(/(?:餐饮|交通|购物|娱乐|住房|医疗|教育)/);
      return { category: catMatch ? catMatch[0] : undefined };
    },
  },
  {
    intent: 'get_net_balance',
    agent: 'analyst',
    patterns: [
      /(?:净资产|净值|资产总额|资产情况|资产健康)/,
      /(?:存款|资产).*(?:有多少|多少了|还剩多少)/,
      /(?:流动资金|现金流|可用资金).*(?:多少|还有|还剩)/,
      /(?:多少|还有|还剩).*(?:流动资金|现金流|可用资金)/,
      /我.*(?:有多少|还剩).*(?:钱|资产)/,
      /财务.*(?:状况|健康)/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'set_budget',
    agent: 'coach',
    priority: 0.1,
    patterns: [
      /.*预算(?:设成|设置为|设为|调整为|调到|定为|是|为)?\s*\d+(?:\.\d{1,2})?.*/,
      /(?:设置|设定|设定一个).*预算\s*.+\s*(\d+(?:\.\d{1,2})?)/,
      /(?:给|把)?\s*[\u4e00-\u9fa5A-Za-z]{1,16}设个\s*(?:\d+(?:\.\d{1,2})?)?的?预算/,
      /(.+).*预算.*(\d+(?:\.\d{1,2})?)/,
      /预算\s*(?:是|为|设为).*(\d+(?:\.\d{1,2})?)/,
      /限[制定].*(.+?).*\s*(\d+)/,
    ],
    extractParams: (match, text) => {
      const budgets = extractBudgets(text);
      if (budgets.length > 0) {
        return {
          category: budgets[0].category,
          limit: budgets[0].limit,
          budgets,
        };
      }
      const colloquialBudget = text.match(/(?:给|把)?\s*([\u4e00-\u9fa5A-Za-z]{1,16})设个\s*(\d+(?:\.\d{1,2})?)?的?预算/);
      if (colloquialBudget) {
        return {
          category: cleanupCategory(colloquialBudget[1]),
          limit: colloquialBudget[2] ? parseFloat(colloquialBudget[2]) : 0,
        };
      }
      if (!match) return {};
      let category = '';
      let limit = 0;
      for (let i = 1; i < match.length; i++) {
        const v = match[i];
        if (/^\d+(\.\d{1,2})?$/.test(v)) {
          limit = parseFloat(v);
        } else if (v) {
          category = cleanupCategory(v.replace(/[预算是为设制定限制]/g, ''));
        }
      }
      if (!category) category = '餐饮';
      if (!limit) {
        const numMatch = text.match(/(\d+(?:\.\d{1,2})?)\s*(?:块|元|块钱?)?/);
        limit = numMatch ? parseFloat(numMatch[1]) : 0;
      }
      return { category, limit };
    },
  },
  {
    intent: 'create_savings_goal',
    agent: 'coach',
    patterns: [
      /(?:创建|新建|设立).*(?:储蓄|存钱|储蓄目标)/,
      /(?:储蓄|存钱).*(?:目标|计划)/,
      /(?:攒钱|存钱)目标.*/,
      /想?存\s*(\d+(?:\.\d{1,2})?)/,
      /攒钱.*(\d+(?:\.\d{1,2})?)/,
    ],
    extractParams: (match, text) => {
      let name = '储蓄目标';
      let targetAmount = 0;
      if (match) {
        for (let i = 1; i < match.length; i++) {
          const v = match[i];
          if (/^\d+(\.\d{1,2})?$/.test(v)) {
            targetAmount = parseFloat(v);
          }
        }
      }
      if (!targetAmount) {
        const numMatch = text.match(/(\d+(?:\.\d{1,2})?)\s*(?:块|元|块钱?)?/);
        targetAmount = numMatch ? parseFloat(numMatch[1]) : 0;
      }
      name = text.replace(/[创建新建设立目标计划存钱储蓄攒钱\d+\.\d+\d]/g, '').trim() || name;
      return { name, targetAmount };
    },
  },
  {
    intent: 'get_savings',
    agent: 'coach',
    patterns: [
      /(?:查看|显示).*(?:储蓄|存钱)/,
      /(?:储蓄|存钱).*(?:进度|计划|目标)/,
      /(?:基金|目标|存买|旅行|买车).*(?:存了多少|进度|怎样|怎么样)/,
      /储蓄.*(?:多少|怎么)/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'get_advice',
    agent: 'coach',
    patterns: [
      /(?:建议|推荐|怎么省|好不好|给.*建议)/,
      /(?:省钱|节约).*(?:方法|建议|技巧)/,
      /怎么.*(?:省|节约|理财)/,
      /(?:怎么|怎样).*(?:控制消费|避免月光|少花|存下钱)/,
      /(?:控制消费|避免月光).*(?:好|建议|方法)?/,
      /给.*理财.*建议/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'get_streak',
    agent: 'coach',
    patterns: [
      /(?:打卡|连续|坚持).*(?:天数|多少|记录|情况)/,
      /打卡.*第几天/,
      /(?:记账|记).*(?:打卡|连续|坚持)/,
      /多少.*天.*记账/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'get_achievements',
    agent: 'coach',
    patterns: [
      /(?:成就|徽章|奖杯|荣誉)/,
      /(?:查看|显示).*(?:成就|徽章)/,
      /我.*什么.*成就/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'safety_check',
    agent: 'guardian',
    patterns: [
      /安全.*(?:扫描|检查|检测)/,
      /(?:扫描|检查|检测).*(?:安全|风险)/,
      /(?:账户|账号|数据|应用).*(?:安全|风险)/,
      /检查.*安全吗/,
      /有.*安全.*问题/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'privacy_report',
    agent: 'guardian',
    patterns: [
      /(?:隐私|数据).*(?:报告|情况|状态)/,
      /(?:数据|信息).*(?:安全|隐私)/,
      /我的.*数据.*(?:在哪|安全|怎么)/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'subscriptions',
    agent: 'guardian',
    patterns: [
      /订阅.*(?:分析|检测|检查|扫描)/,
      /(?:分析|检测|检查).*订阅/,
      /(?:什么|哪些).*(?:订阅|会员).*(?:在|扣|付)/,
      /订阅.*(?:服务|有哪些|列表|清单)/,
      /(?:查看|检查|分析)?.*(?:自动续费|续费项目)/,
      /(?:订阅|会员).*(?:快到期|到期|续费)/,
      /自动.*(?:扣费|扣款|续费)/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'create_reminder',
    agent: 'guardian',
    patterns: [
      /(?:创建|添加|设置).*(?:提醒|通知)/,
      /(?:每个工作日|工作日|每周一到周五|周一到周五).*(?:提醒|通知)/,
      /.*提醒.*(?:还信用卡|交房租|交水电|付款|缴费).*/,
      /每(?:月|周|天).*(?:提醒|通知)/,
      /提醒我.*/,
      /提醒.*(?:预算|看预算|检查预算)/,
      /提醒.*记账/,
      /每天.*提醒/,
    ],
    extractParams: (_match, text) => {
      const name = '记账提醒';
      let type: 'reminder' | 'backup' | 'report' = 'reminder';
      if (text.includes('备份')) type = 'backup';
      if (text.includes('报告')) type = 'report';
      let cron = '0 20 * * *';
      const timeMatch = text.match(/(\d{1,2})[点:：](\d{0,2})/);
      if (timeMatch) {
        const hour = parseInt(timeMatch[1]);
        const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        cron = `${minute} ${hour} * * *`;
      }
      if (/(每个工作日|工作日|每周一到周五|周一到周五)/.test(text)) {
        const parts = cron.split(/\s+/);
        cron = `${parts[0]} ${parts[1]} * * 1-5`;
      }
      return { name, type, cron };
    },
  },
  {
    intent: 'get_reminders',
    agent: 'guardian',
    priority: 0.45,
    patterns: [
      /(?:查看|显示|列出|我的|所有|哪些|设置了哪些).*(?:提醒|定时|任务)/,
      /(?:有哪些|什么).*提醒/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'delete_reminder',
    agent: 'guardian',
    patterns: [
      /(?:删除|删掉|删了|取消|移除).*提醒/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'proactive_check',
    agent: 'coach',
    patterns: [
      /(?:主动|智能|全面).*(?:检查|扫描|分析|诊断)/,
      /(?:健康|财务).*(?:检查|诊断|评估)/,
      /看看.*(?:整体|全部).*情况/,
      /帮我.*检查.*(?:财务|预算|账单)/,
      /(?:财务|消费).*体检/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'proactive_insights',
    agent: 'coach',
    patterns: [
      /(?:智能|AI).*(?:建议|洞察|分析)/,
      /(?:财务|消费|预算).*(?:洞察|优化)/,
      /分析.*(?:消费习惯|消费模式|记账习惯)/,
      /有什么.*(?:建议|推荐)/,
      /给我.*(?:建议|洞察)/,
      /怎么.*(?:优化|改善|改)/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'today_summary',
    agent: 'coach',
    patterns: [
      /(?:今天|今日).*(?:概览|总结|情况|汇总)/,
      /(?:日报|今日)/,
      /今天.*(?:怎么|如何)/,
      /(?:今日|当天).*(?:收支|消费)/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'setup_reminder',
    agent: 'coach',
    patterns: [
      /(?:设置|打开|开启).*(?:每日|每天).*提醒/,
      /(?:开启|开始).*提醒.*记账/,
      /(?:设置|设定).*记账.*提醒/,
      /每天.*提醒.*记账/,
    ],
    extractParams: (_match, text) => {
      let hour = 20;
      let minute = 0;
      const timeMatch = text.match(/(\d{1,2})[点:：](\d{0,2})/);
      if (timeMatch) {
        hour = parseInt(timeMatch[1]);
        minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      }
      return { hour, minute };
    },
  },
  {
    intent: 'verify_chain',
    agent: 'guardian',
    patterns: [
      /验证.*(?:哈希|数据完整)/,
      /(?:哈希|数据完整).*验证/,
      /(?:数据链|链路|账本数据链).*(?:完整|校验|验证)?/,
      /账本数据.*(?:完整|校验|验证)/,
      /数据.*被.*(?:篡改|修改)/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'greeting',
    agent: 'coach',
    patterns: [
      /^(?:你好|hi|hello|嗨|在吗|hey)/i,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'list_ai_memories',
    agent: 'master',
    priority: 0.3,
    patterns: [
      /.*(?:你|AI|助手).*(?:记住|记得).*(?:什么|哪些|内容).*/,
      /.*(?:查看|列出|显示).*(?:AI)?记忆.*/,
      /.*(?:我的)?(?:记忆|偏好).*(?:列表|清单).*/,
    ],
    extractParams: (_match, text) => {
      let kind: string | undefined;
      if (/表达|NLU|意图|学习/.test(text)) kind = 'nlu_learning';
      else if (/偏好|用户/.test(text)) kind = 'user_profile';
      return { kind, limit: 20 };
    },
  },
  {
    intent: 'delete_ai_memory',
    agent: 'master',
    priority: 0.3,
    patterns: [
      /.*(?:删除|忘记|移除).*(?:AI)?(?:记忆|偏好).*/,
      /.*不要再记住.*/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'set_ai_learning_enabled',
    agent: 'master',
    priority: 0.3,
    patterns: [
      /.*(?:关闭|停用|禁用).*(?:自动学习|学习功能|自学习).*/,
      /.*(?:开启|打开|启用).*(?:自动学习|学习功能|自学习).*/,
    ],
    extractParams: (_match, text) => ({
      enabled: /(?:开启|打开|启用)/.test(text),
    }),
  },
  {
    intent: 'remember_user_preference',
    agent: 'master',
    priority: 0.35,
    patterns: [
      /^(?:请)?记住[：:\s]*(?!.*(?:什么|哪些))(.+)/,
      /^我(?:喜欢|偏好|习惯|希望)[：:\s]*(.+)/,
    ],
    extractParams: (_match, text) => {
      const value = text
        .replace(/^(?:请)?记住[：:\s]*/, '')
        .replace(/^我(?:喜欢|偏好|习惯|希望)[：:\s]*/, '')
        .trim();
      const key = /回复|回答|语气|简洁|详细/.test(text) ? '沟通偏好'
        : /提醒|通知/.test(text) ? '提醒偏好'
          : /预算|消费|超支/.test(text) ? '预算偏好'
            : '用户偏好';
      return { key, value, confidence: 0.9 };
    },
  },
  {
    intent: 'update_ai_persona',
    agent: 'master',
    priority: 0.25,
    patterns: [
      /.*(?:严谨|幽默|主动).*(?:一点|一些|调高|提高|降低|少点).*/,
      /.*(?:人格|人设|风格).*(?:调整|修改|更新|设置).*/,
    ],
    extractParams: (_match, text) => ({
      rigor: /严谨.*(?:一点|一些|调高|提高)|(?:调高|提高).*严谨/.test(text) ? 7 : undefined,
      humor: /幽默.*(?:一点|一些|调高|提高)|(?:调高|提高).*幽默/.test(text) ? 7 : undefined,
      proactivity: /主动.*(?:一点|一些|调高|提高)|(?:调高|提高).*主动/.test(text) ? 7 : undefined,
    }),
  },
  {
    intent: 'list_assets',
    agent: 'ledger',
    priority: 0.25,
    patterns: [
      /(?:查看|显示|列出|我的|所有|看看).*(?:资产|账户)/,
      /(?:有什么|哪些).*资产/,
      /(?:有哪些|什么).*(?:账户)/,
      /(?:资产|理财).*(?:列表|清单|情况|查询)/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'add_asset',
    agent: 'ledger',
    priority: 0.15,
    patterns: [
      /.*(?:余额|存款|市值)\s*\d+(?:\.\d{1,2})?.*(?:加到|添加到|记到|录入到)?资产.*/,
      /.*(?:余额|存款|市值)(?:还有|还剩|是|为)?\s*\d+(?:\.\d{1,2})?\s*万?.*/,
      /.*(?:资产|房|房产|车|股票|基金|添加|增加|新增|记录).*(?:价值|值|估值)\s*\d+(?:\.\d{1,2})?\s*万?.*/,
      /(?:添加|增加|新增|记录).*(?:股票|基金|银行|现金|账户)/,
      /(?:添加|增加|新增|记录).*(?:资产)/,
      /(?:资产|存款|房产|股票|基金).*(?:添加|记录)/,
      /我(?:有|的).*?(?:存款|房产|股票|基金)\s*(\d+(?:\.\d{1,2})?)/,
    ],
    extractParams: (_match, text) => extractAssetParams(text),
  },
  {
    intent: 'list_debts',
    agent: 'ledger',
    priority: 0.25,
    patterns: [
      /(?:查看|显示|列出|我的|所有|我有).*(?:债务|欠款|借款|借出|外债)/,
      /(?:有什么|哪些).*(?:债务|欠款|借出|借入)/,
      /(?:欠了|借了|借出).*钱/,
      /(?:债务|欠款).*(?:列表|清单|情况)/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'add_debt',
    agent: 'ledger',
    priority: 0.25,
    patterns: [
      /.*(?:借给|借出给)\s*[\u4e00-\u9fa5A-Za-z0-9_]{1,20}\s*\d+(?:\.\d{1,2})?.*/,
      /.*(?:向|找)\s*[\u4e00-\u9fa5A-Za-z0-9_]{1,20}\s*(?:借了|借)\s*\d+(?:\.\d{1,2})?.*/,
      /.*欠\s*[\u4e00-\u9fa5A-Za-z0-9_]{1,20}\s*(?:\d+(?:\.\d{1,2})?|[零〇一二两三四五六七八九十百千万]+).*/,
      /.*[\u4e00-\u9fa5A-Za-z0-9_]{1,20}\s*欠我\s*(?:\d+(?:\.\d{1,2})?|[零〇一二两三四五六七八九十百千万]+).*/,
      /(?:添加|记录|新增).*(?:债务|欠款|借款)/,
      /(?:借给|借了|欠).*(?:钱|多少)/,
      /(?:别人|谁).*欠.*钱/,
    ],
    extractParams: (_match, text) => extractDebtParams(text),
  },
  {
    intent: 'list_tags',
    agent: 'coach',
    patterns: [
      /(?:查看|显示|我的).*(?:标签)/,
      /(?:有什么|哪些).*标签/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'add_tag',
    agent: 'ledger',
    patterns: [
      /(?:添加|创建|新建).*(?:标签)/,
      /(?:加个|加一个|打上).*(?:标签)/,
      /(?:标签).*(?:添加|创建|命名)/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'import_bills',
    agent: 'ledger',
    priority: 0.1,
    patterns: [
      /(?:导入|上传|批量导入).*(?:这段|以下|这些).*/,
      /.*(?:这些|这几笔).*(?:批量)?导入.*/,
      /(?:导入|上传|批量导入).*(?:账单|数据)/,
      /(?:微信|支付宝|CSV|银行流水|流水).*(?:账单|导入|上传)?/,
      /(?:导入).*(?:微信|支付宝)账单/,
    ],
    extractParams: (_match, text) => {
      const rawText = text.includes('：') || text.includes(':')
        ? text.split(/[：:]/).slice(1).join(':').trim()
        : text.replace(/(?:这些|这几笔)?帮我(?:批量)?导入(?:账单|数据)?/g, '').trim();
      return rawText ? { rawText } : {};
    },
  },
  {
    intent: 'export_data',
    agent: 'analyst',
    patterns: [
      /(?:导出|备份|保存).*(?:账单|数据)/,
      /(?:下载|导出).*(?:CSV|JSON|Excel|报表)/,
      /(?:创建|制作).*(?:备份|导出)/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'sync_webdav',
    agent: 'guardian',
    patterns: [
      /(?:同步|备份).*(?:云端|服务器|WebDAV|网盘)/,
      /(?:同步|备份).*(?:数据|账本|账单)/,
      /(?:上传|下载).*(?:备份|同步|数据)/,
      /(?:多端|多设备).*(?:同步)/,
      /(?:配置|设置).*(?:同步|WebDAV)/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'reimbursement',
    agent: 'ledger',
    priority: 0.25,
    patterns: [
      /(?:提交|发起|申请|创建|添加).*(?:报销单|报销)/,
      /(?:报销|申请报销).*(?:记录|添加|创建)/,
      /(?:报销|申请报销|提交报销|发起报销).*(?:\d+(?:\.\d{1,2})?|[零〇一二两三四五六七八九十百千万]+)/,
      /(?:添加|创建|记录).*(?:报销)/,
      /(?:报销).*(?:审批|状态|进度)/,
      /(?:查看|我的).*(?:报销)/,
    ],
    extractParams: (_match, text) => extractReimbursementParams(text),
  },
  {
    intent: 'credit_card',
    agent: 'ledger',
    priority: 0.12,
    patterns: [
      /(?:添加|绑定|录入).*(?:信用卡)/,
      /(?:信用卡).*(?:添加|绑定|管理)/,
      /(?:信用卡).*(?:额度|账单日|还款日|账单|到期)/,
    ],
    extractParams: (_match, text) => extractCreditCardParams(text),
  },
  {
    intent: 'modify_bill',
    agent: 'ledger',
    priority: 0.18,
    patterns: [
      /.*(?:那笔|这笔|账单|记录).*(?:改成|改为|调整为|分类为|设为).*/,
      /.*(?:改成|改为|调整为|分类为|设为).*(?:餐饮|交通|购物|娱乐|住房|医疗|教育|水电|其他|工资|奖金|投资).*/,
      /.*(?:改一下|修改|调整).*(?:账|账单|记录|那笔|这笔).*/,
    ],
    extractParams: (_match, text) => extractModifyBillParams(text),
  },
  {
    intent: 'transfer_asset',
    agent: 'ledger',
    patterns: [
      /(?:转账|转移|划转).*(?:资产|账户|资金)/,
      /从.*(?:转|划).*到/,
      /(?:资产|账户).*(?:间|互).*(?:转|移)/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'settle',
    agent: 'ledger',
    patterns: [
      /(?:结算|支付|到账).*(?:报销)/,
      /(?:报销).*(?:结算|付款|打款)/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'share_bills',
    agent: 'coach',
    patterns: [
      /(?:分享|共享|发送).*(?:账单|记账|账本)/,
      /(?:生成|创建).*(?:分享|共享)链接/,
      /(?:账单).*(?:给别人|发给|分享)/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'ocr_import',
    agent: 'ledger',
    patterns: [
      /(?:OCR|拍照|扫描|识别).*(?:导入|账单|小票)/,
      /(?:图片|截图|小票).*(?:导入|识别)/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'level_status',
    agent: 'coach',
    patterns: [
      /(?:查看|我的).*(?:等级|等级|级别)/,
      /(?:等级|级别).*(?:查看|是多少)/,
      /(?:挑战|任务|challenge)/,
      /有哪些.*挑战/,
    ],
    extractParams: () => ({}),
  },
];

export function classifyIntent(text: string): IntentResult {
  let bestMatch: IntentResult = { intent: 'unknown', params: {}, confidence: 0, agent: 'master' };
  let bestScore = 0;

  for (const item of intentPatterns) {
    for (const pattern of item.patterns) {
      const match = text.match(pattern);
      if (match) {
        const confidence = calculateConfidence(match, text);
        const score = confidence + (item.priority || 0);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = {
            intent: item.intent,
            params: item.extractParams(match, text),
            confidence,
            agent: item.agent,
          };
        }
      }
    }
  }

  return applyLearnedIntent(text, bestMatch);
}

function calculateConfidence(match: RegExpMatchArray, text: string): number {
  const matchedLength = match[0].length;
  const ratio = matchedLength / text.length;
  return Math.min(ratio + 0.3, 0.95);
}
