import { IntentResult } from '../../shared/types';

const intentPatterns: { intent: string; patterns: RegExp[]; extractParams: (match: RegExpMatchArray | null, text: string) => Record<string, unknown> }[] = [
  {
    intent: 'add_expense',
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
    intent: 'greeting',
    patterns: [
      /^(?:你好|hi|hello|嗨|在吗|hey)/i,
    ],
    extractParams: () => ({}),
  },
];

export function classifyIntent(text: string): IntentResult {
  let bestMatch: IntentResult = { intent: 'unknown', params: {}, confidence: 0 };

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
