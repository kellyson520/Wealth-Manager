import { classifyIntent } from '../../agents/master/nlu';

describe('NLU Intent Classification', () => {
  describe('add_expense', () => {
    test.each([
      ['午饭花了35块', 35, '午饭'],
      ['打车花了15元', 15, '打车'],
      ['记一笔 咖啡 28', 28, '咖啡'],
      ['支出 话费 100', 100, '话'],
      ['花了50块买水果', 50, '买水果'],
    ])('"%s" → expense ¥%s, merchant="%s"', (input, expectedAmount, expectedMerchant) => {
      const result = classifyIntent(input);
      expect(result.intent).toBe('add_expense');
      expect(result.agent).toBe('ledger');
      expect(result.params.amount).toBe(expectedAmount);
      expect(result.params.merchant).toContain(expectedMerchant);
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    test.each([
      '公交卡充值50元',
      '买菜花了30',
    ])('"%s" should match add_expense', (input) => {
      const result = classifyIntent(input);
      expect(result.intent).toBe('add_expense');
      expect(result.params.amount).toBeGreaterThan(0);
    });

    test('handles decimal amounts correctly', () => {
      const result = classifyIntent('午饭花了35.5块');
      expect(result.intent).toBe('add_expense');
      expect(result.params.amount).toBe(35.5);
    });

    test('handles amounts up to 2 decimal places', () => {
      const result = classifyIntent('买菜99.99元');
      expect(result.intent).toBe('add_expense');
      expect(result.params.amount).toBe(99.99);
    });
  });

  describe('add_income', () => {
    test.each([
      ['工资到账5000', 5000, ''],
      ['收入奖金3000', 3000, '奖金'],
      ['到账1000', 1000, ''],
      ['工资8000', 8000, ''],
    ])('"%s" → income ¥%s, merchant="%s"', (input, expectedAmount, expectedMerchant) => {
      const result = classifyIntent(input);
      expect(result.intent).toBe('add_income');
      expect(result.agent).toBe('ledger');
      expect(result.params.amount).toBe(expectedAmount);
      if (expectedMerchant) {
        expect(result.params.merchant).toContain(expectedMerchant);
      }
    });

    test('matches "到账1000" as income', () => {
      const result = classifyIntent('到账1000');
      expect(result.intent).toBe('add_income');
      expect(result.params.amount).toBe(1000);
    });
  });

  describe('search_bills', () => {
    test.each([
      ['查账单', ''],
      ['查询餐饮消费', '餐饮消费'],
      ['最近账单', '最近'],
      ['这个月账单', '这个月'],
      ['今天账单', '今天'],
    ])('"%s" → search_bills', (input) => {
      const result = classifyIntent(input);
      expect(result.intent).toBe('search_bills');
      expect(result.agent).toBe('ledger');
    });

    test('extracts time period correctly', () => {
      expect(classifyIntent('今天账单').params.period).toBe('today');
      expect(classifyIntent('本月消费').params.period).toBe('month');
    });
  });

  describe('get_summary', () => {
    test.each([
      '花了多少',
      '本月消费统计',
      '支出情况',
      '账单汇总',
    ])('"%s" → get_summary', (input) => {
      const result = classifyIntent(input);
      expect(result.intent).toBe('get_summary');
    });

    test('extracts time period from summary queries', () => {
      expect(classifyIntent('今天花了多少').params.period).toBe('today');
      expect(classifyIntent('本月消费情况').params.period).toBe('month');
      expect(classifyIntent('本周支出').params.period).toBe('week');
    });
  });

  describe('greeting', () => {
    test.each([
      '你好',
      'hi',
      'hello',
      '在吗',
    ])('"%s" → greeting', (input) => {
      const result = classifyIntent(input);
      expect(result.intent).toBe('greeting');
    });
  });

  describe('safety queries', () => {
    test.each([
      ['安全扫描', 'safety_check', 'guardian'],
      ['安全检测', 'safety_check', 'guardian'],
      ['隐私报告', 'privacy_report', 'guardian'],
      ['订阅分析', 'subscriptions', 'guardian'],
      ['分析订阅检测', 'subscriptions', 'guardian'],
      ['验证哈希', 'verify_chain', 'guardian'],
      ['数据完整性验证', 'verify_chain', 'guardian'],
    ])('"%s" → %s routed to %s', (input, expectedIntent, expectedAgent) => {
      const result = classifyIntent(input);
      expect(result.intent).toBe(expectedIntent);
      expect(result.agent).toBe(expectedAgent);
    });
  });

  describe('analyst queries', () => {
    test.each([
      ['分类趋势分析', 'get_category_trend'],
      ['异常检测', 'get_anomaly'],
      ['商家排行', 'get_merchants'],
      ['年度统计', 'get_yearly'],
      ['生成饼图', 'get_chart'],
      ['预算状态', 'get_budget_status'],
      ['净资产', 'get_net_balance'],
    ])('"%s" → %s', (input, expectedIntent) => {
      const result = classifyIntent(input);
      expect(result.intent).toBe(expectedIntent);
      expect(result.agent).toBe('analyst');
    });
  });

  describe('coach queries', () => {
    test.each([
      ['设置餐饮预算500', 'set_budget'],
      ['创建储蓄目标', 'create_savings_goal'],
      ['储蓄进度', 'get_savings'],
      ['理财建议', 'get_advice'],
      ['省钱方法', 'get_advice'],
      ['连续记账天数', 'get_streak'],
      ['成就徽章', 'get_achievements'],
    ])('"%s" → %s', (input, expectedIntent) => {
      const result = classifyIntent(input);
      expect(result.intent).toBe(expectedIntent);
      expect(result.agent).toBe('coach');
    });
  });

  describe('edge cases', () => {
    test('empty string returns unknown', () => {
      const result = classifyIntent('');
      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    test('random gibberish returns unknown', () => {
      const result = classifyIntent('asdfghjkl12345');
      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    test('very long text does not crash', () => {
      const longText = '我今天去'.repeat(500);
      const result = classifyIntent(longText);
      expect(result).toBeDefined();
    });

    test('special characters are handled gracefully', () => {
      const result = classifyIntent('!@#$%^&*()_+-=[]{}|;:,.<>?/~`');
      expect(result).toBeDefined();
    });
  });

  describe('safety - injection attempts', () => {
    test('SQL injection text does not crash NLU', () => {
      const texts = [
        "'; DROP TABLE bills; --",
        '<script>alert("xss")</script>',
        '${malicious_code}',
        '1 OR 1=1',
        'null\0byte',
      ];
      for (const text of texts) {
        const result = classifyIntent(text);
        expect(result).toBeDefined();
      }
    });

    test('unicode and emoji heavy text is handled', () => {
      const result = classifyIntent('🍕🍔🍟🍣午餐花了50块💰💸');
      expect(result.intent).toBe('add_expense');
      expect(result.params.amount).toBe(50);
    });
  });
});

describe('NLU Confidence Scoring', () => {
  test('exact pattern match has high confidence', () => {
    const result = classifyIntent('午饭花了35块');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test('partial match has reasonable confidence', () => {
    const result = classifyIntent('我觉得午饭大概花了35块吧，可能记不太清了');
    expect(result.intent).toBe('add_expense');
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  test('prefers longer match over shorter match', () => {
    const match1 = classifyIntent('设置餐饮预算500');
    const match2 = classifyIntent('50');
    expect(match1.confidence).toBeGreaterThan(match2.confidence);
  });
});

describe('NLU real model regression cases', () => {
  test.each([
    ['午饭美团外卖花了42.8元，帮我记一笔', 'add_expense', 'ledger'],
    ['工资到账12800，备注6月工资', 'add_income', 'ledger'],
    ['这周我餐饮一共花了多少？', 'get_summary', 'analyst'],
    ['我最近是不是有异常消费？', 'get_anomaly', 'analyst'],
    ['我想知道哪些订阅还在扣费', 'subscriptions', 'guardian'],
  ])('"%s" routes to %s/%s', (input, expectedIntent, expectedAgent) => {
    const result = classifyIntent(input);
    expect(result.intent).toBe(expectedIntent);
    expect(result.agent).toBe(expectedAgent);
  });

  test('routes consumption trend chart request to chart analysis', () => {
    const result = classifyIntent('帮我看一下这个月消费趋势，最好给个图');
    expect(result.intent).toBe('get_chart');
    expect(result.agent).toBe('analyst');
    expect(result.params.chartType).toBe('line');
    expect(result.params.period).toBe('month');
  });

  test('extracts multiple budgets from a single utterance', () => {
    const result = classifyIntent('把餐饮预算设成1800，交通预算设成600');
    expect(result.intent).toBe('set_budget');
    expect(result.params.category).toBe('餐饮');
    expect(result.params.limit).toBe(1800);
    expect(result.params.budgets).toEqual([
      { category: '餐饮', limit: 1800 },
      { category: '交通', limit: 600 },
    ]);
  });

  test('routes delete bill request through guardian confirmation flow', () => {
    const result = classifyIntent('昨晚星巴克那笔删掉吧');
    expect(result.intent).toBe('delete_bill');
    expect(result.agent).toBe('guardian');
    expect(result.params.keyword).toBe('星巴克');
    expect(result.params.requiresConfirmation).toBe(true);
  });

  test('uses scheduler-compatible five-field cron for recurring reminders', () => {
    const result = classifyIntent('每晚9点提醒我记账');
    expect(result.intent).toBe('create_reminder');
    expect(result.agent).toBe('guardian');
    expect(result.params.cron).toBe('0 9 * * *');
  });

  test('extracts bank balance as an asset addition', () => {
    const result = classifyIntent('招商银行活期余额23000，帮我加到资产里');
    expect(result.intent).toBe('add_asset');
    expect(result.agent).toBe('ledger');
    expect(result.params.name).toBe('招商银行活期');
    expect(result.params.amount).toBe(23000);
    expect(result.params.type).toBe('银行账户');
  });

  test('extracts lent money and relative due date', () => {
    const result = classifyIntent('借给小王3000，下个月15号还');
    const now = new Date();
    const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    const expectedDueDate = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-15`;
    expect(result.intent).toBe('add_debt');
    expect(result.agent).toBe('ledger');
    expect(result.params.counterparty).toBe('小王');
    expect(result.params.principal).toBe(3000);
    expect(result.params.type).toBe('借出');
    expect(result.params.dueDate).toBe(expectedDueDate);
  });

  test('keeps pasted bill text for import handler', () => {
    const result = classifyIntent('导入这段账单：2026-06-01 滴滴 28.5；2026-06-02 全家 19.8');
    expect(result.intent).toBe('import_bills');
    expect(result.agent).toBe('ledger');
    expect(result.params.rawText).toBe('2026-06-01 滴滴 28.5；2026-06-02 全家 19.8');
  });
});
