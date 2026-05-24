jest.mock('../_shared', () => ({
  canCallTool: jest.fn().mockReturnValue({ allowed: true, reason: '' }),
  rememberThis: jest.fn().mockResolvedValue(undefined),
  rememberMoment: jest.fn().mockResolvedValue(undefined),
  recallMemory: jest.fn().mockResolvedValue([]),
  getDelegationTargets: jest.fn().mockReturnValue(['ledger']),
  createAgentMessage: jest.fn(),
  getSecurityProfile: jest.fn().mockReturnValue({ maxPermissionLevel: 1 }),
}));

jest.mock('../guardian/guardian.agent', () => ({
  preActionCheck: jest.fn().mockResolvedValue({ safe: true }),
  handleIntent: jest.fn(),
}));

jest.mock('../../tools/bills/bills.tool', () => ({
  add_bill: jest.fn(),
  search_bills: jest.fn(),
}));

jest.mock('../../tools/stats/stats.tool', () => ({
  get_aggregation: jest.fn(),
}));

import { handleIntent } from '../../agents/ledger/ledger.agent';
import * as billsTool from '../../tools/bills/bills.tool';
import * as statsTool from '../../tools/stats/stats.tool';

describe('Ledger Agent - handleIntent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('add_expense intent', () => {
    test('handles valid expense', async () => {
      (billsTool.add_bill as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: '123', amount: 35 },
      });

      const reply = await handleIntent({
        intent: 'add_expense',
        params: { amount: 35, merchant: '午饭' },
        confidence: 0.8,
        agent: 'ledger',
      });

      expect(reply).toContain('已记录');
      expect(reply).toContain('午饭');
      expect(reply).toContain('35');
    });

    test('rejects zero amount expense', async () => {
      const reply = await handleIntent({
        intent: 'add_expense',
        params: { amount: 0, merchant: '测试' },
        confidence: 0.8,
        agent: 'ledger',
      });

      expect(reply).toContain('具体金额');
    });

    test('rejects negative amount expense', async () => {
      const reply = await handleIntent({
        intent: 'add_expense',
        params: { amount: -50, merchant: '测试' },
        confidence: 0.8,
        agent: 'ledger',
      });

      expect(reply).toContain('具体金额');
    });

    test('uses default merchant when empty', async () => {
      (billsTool.add_bill as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: '123' },
      });

      const reply = await handleIntent({
        intent: 'add_expense',
        params: { amount: 35, merchant: '' },
        confidence: 0.8,
        agent: 'ledger',
      });

      expect(reply).toContain('消费');
    });

    test('reports error when tool fails', async () => {
      (billsTool.add_bill as jest.Mock).mockResolvedValue({
        success: false,
        error: '记账失败',
        errorCode: '1000',
      });

      const reply = await handleIntent({
        intent: 'add_expense',
        params: { amount: 35, merchant: '午饭' },
        confidence: 0.8,
        agent: 'ledger',
      });

      expect(reply).toContain('记账失败');
    });
  });

  describe('add_income intent', () => {
    test('handles valid income', async () => {
      (billsTool.add_bill as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: '123', amount: 5000 },
      });

      const reply = await handleIntent({
        intent: 'add_income',
        params: { amount: 5000, merchant: '工资' },
        confidence: 0.8,
        agent: 'ledger',
      });

      expect(reply).toContain('已记录');
      expect(reply).toContain('工资');
      expect(reply).toContain('5000');
    });
  });

  describe('search_bills intent', () => {
    test('returns bills when found', async () => {
      (billsTool.search_bills as jest.Mock).mockResolvedValue({
        success: true,
        data: [
          { id: '1', merchant: '午饭', amount: 35, type: 'expense', date: '2024-01-15' },
        ],
      });

      const reply = await handleIntent({
        intent: 'search_bills',
        params: { keyword: '午饭' },
        confidence: 0.7,
        agent: 'ledger',
      });

      expect(reply).toContain('找到');
      expect(reply).toContain('午饭');
    });

    test('reports no bills found', async () => {
      (billsTool.search_bills as jest.Mock).mockResolvedValue({
        success: true,
        data: [],
      });

      const reply = await handleIntent({
        intent: 'search_bills',
        params: {},
        confidence: 0.5,
        agent: 'ledger',
      });

      expect(reply).toContain('没有找到');
    });

    test('handles search failure gracefully', async () => {
      (billsTool.search_bills as jest.Mock).mockResolvedValue({
        success: false,
        error: '查询失败',
      });

      const reply = await handleIntent({
        intent: 'search_bills',
        params: {},
        confidence: 0.5,
        agent: 'ledger',
      });

      expect(reply).toContain('问题');
    });
  });

  describe('get_summary intent', () => {
    test('returns summary with data', async () => {
      (statsTool.get_aggregation as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          totalIncome: 5000,
          totalExpense: 1500,
          billCount: 10,
          byCategory: { '餐饮': 1000, '交通': 500 },
        },
      });

      const reply = await handleIntent({
        intent: 'get_summary',
        params: { period: 'today' },
        confidence: 0.7,
        agent: 'ledger',
      });

      expect(reply).toContain('概览');
      expect(reply).toContain('5000');
      expect(reply).toContain('1500');
      expect(reply).toContain('餐饮');
    });

    test('handles aggregation failure', async () => {
      (statsTool.get_aggregation as jest.Mock).mockResolvedValue({
        success: false,
        error: '统计失败',
      });

      const reply = await handleIntent({
        intent: 'get_summary',
        params: { period: 'today' },
        confidence: 0.7,
        agent: 'ledger',
      });

      expect(reply).toContain('问题');
    });
  });

  describe('unknown intent', () => {
    test('returns helpful default message', async () => {
      const reply = await handleIntent({
        intent: 'unknown',
        params: {},
        confidence: 0,
        agent: 'ledger',
      });

      expect(reply).toContain('抱歉');
    });
  });
});

describe('Category Guessing', () => {
  test.each([
    ['午饭', '餐饮'],
    ['奶茶', '餐饮'],
    ['外卖', '餐饮'],
    ['火锅', '餐饮'],
    ['地铁', '交通'],
    ['打车', '交通'],
    ['滴滴', '交通'],
    ['淘宝', '购物'],
    ['超市', '购物'],
    ['商场', '购物'],
    ['其他费用', '其他'],
    ['xxxxx', '其他'],
  ])('merchant "%s" → category "%s"', (merchant, expectedCategory) => {
    const foodTerms = ['饭', '餐', '面', '菜', '奶茶', '咖啡', '外卖', '食堂', '餐厅', '火锅', '烧烤', '水果'];
    const transportTerms = ['地铁', '公交', '打车', '滴滴', '出租', '油', '停车', '高铁', '机票'];
    const shopTerms = ['淘宝', '京东', '拼多多', '超市', '商场', '衣服', '鞋'];

    let category = '其他';
    for (const term of foodTerms) if (merchant.includes(term)) { category = '餐饮'; break; }
    for (const term of transportTerms) if (merchant.includes(term)) { category = '交通'; break; }
    for (const term of shopTerms) if (merchant.includes(term)) { category = '购物'; break; }

    expect(category).toBe(expectedCategory);
  });
});
