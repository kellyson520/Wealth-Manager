import { IntentResult } from '../../shared/types';

const intentPatterns: { intent: string; patterns: RegExp[]; agent: string; extractParams: (match: RegExpMatchArray | null, text: string) => Record<string, unknown> }[] = [
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
        if (/^\d+(\.\d{1,2})?$/.test(v)) {
          amount = parseFloat(v);
        } else if (v) {
          merchant = v.trim();
        }
      }
      return { amount, merchant };
    },
  },
  {
    intent: 'search_bills',
    agent: 'ledger',
    patterns: [
      /查[询找看]?\s*(?:账单|记录|消费|支出|收入)?\s*(.+)?/,
      /最近.*(?:账单|消费|记录)/,
      /这个月.*(?:账单|消费|记录)?/,
      /今天.*(?:账单|消费|记录)?/,
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
    patterns: [
      /分类.*(?:趋势|变化|分析)/,
      /趋势.*(?:分析|报告)/,
      /哪个.*(?:分类|类别).*(?:多|少|高|低)/,
      /消费.*(?:趋势|变化|分布)/,
    ],
    extractParams: (_match, text) => {
      const category = text.replace(/[分类趋势变化分析哪个类别多少高低消费分布]/g, '').trim();
      return { category: category || undefined };
    },
  },
  {
    intent: 'get_anomaly',
    agent: 'analyst',
    patterns: [
      /(?:异常|可疑).*(?:检测|消费|账单|交易)/,
      /(?:检测|发现).*(?:异常|可疑)/,
      /消费.*(?:异常|不正常|可疑)/,
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
      /\d{4}年.*(?:收支|统计)/,
      /过去.*(?:一年|12个月)/,
    ],
    extractParams: (_match, text) => {
      const yearMatch = text.match(/(\d{4})年/);
      return { year: yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear() };
    },
  },
  {
    intent: 'get_chart',
    agent: 'analyst',
    patterns: [
      /(?:生成|画|显示|看).*(?:图表|饼图|折线|柱状)/,
      /(?:图|chart)/i,
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
      /(?:净资产|净值|资产)/,
      /我.*(?:有多少|还剩).*(?:钱|资产)/,
      /财务.*(?:状况|健康)/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'set_budget',
    agent: 'coach',
    patterns: [
      /(?:设置|设定|设定一个).*预算\s*.+\s*(\d+(?:\.\d{1,2})?)/,
      /(.+).*预算.*(\d+(?:\.\d{1,2})?)/,
      /预算\s*(?:是|为|设为).*(\d+(?:\.\d{1,2})?)/,
      /限[制定].*(.+?).*\s*(\d+)/,
    ],
    extractParams: (match, text) => {
      if (!match) return {};
      let category = '';
      let limit = 0;
      for (let i = 1; i < match.length; i++) {
        const v = match[i];
        if (/^\d+(\.\d{1,2})?$/.test(v)) {
          limit = parseFloat(v);
        } else if (v) {
          category = v.replace(/[设置预算是为设制定限制]/g, '').trim();
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
      /给.*理财.*建议/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'get_streak',
    agent: 'coach',
    patterns: [
      /(?:打卡|连续|坚持).*(?:天数|多少|记录|情况)/,
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
      /自动.*(?:扣费|扣款)/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'create_reminder',
    agent: 'guardian',
    patterns: [
      /(?:创建|添加|设置).*(?:提醒|通知)/,
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
        cron = `0 ${minute} ${hour} * * *`;
      }
      return { name, type, cron };
    },
  },
  {
    intent: 'get_reminders',
    agent: 'guardian',
    patterns: [
      /(?:查看|显示|我的).*(?:提醒|定时|任务)/,
      /(?:有哪些|什么).*提醒/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'delete_reminder',
    agent: 'guardian',
    patterns: [
      /(?:删除|取消|移除).*提醒/,
    ],
    extractParams: () => ({}),
  },
  {
    intent: 'verify_chain',
    agent: 'guardian',
    patterns: [
      /验证.*(?:哈希|数据完整)/,
      /(?:哈希|数据完整).*验证/,
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
];

export function classifyIntent(text: string): IntentResult {
  let bestMatch: IntentResult = { intent: 'unknown', params: {}, confidence: 0, agent: 'master' };

  for (const item of intentPatterns) {
    for (const pattern of item.patterns) {
      const match = text.match(pattern);
      if (match) {
        const confidence = calculateConfidence(match, text);
        if (confidence > bestMatch.confidence) {
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

  return bestMatch;
}

function calculateConfidence(match: RegExpMatchArray, text: string): number {
  const matchedLength = match[0].length;
  const ratio = matchedLength / text.length;
  return Math.min(ratio + 0.3, 0.95);
}
