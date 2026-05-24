import { classifyIntent } from '../../agents/master/nlu';

describe('NLU Intent Classification', () => {
  describe('add_expense', () => {
    test.each([
      ['午饭花了35块', 35, '午饭'],
      ['打车花了15元', 15, '打车'],
      ['记一笔 咖啡 28', 28, '咖啡'],
      ['支出 话费 100', 100, '话费'],
      ['花了50块买水果', 50, '买水果'],
      ['晚餐150', 150, '晚餐'],
      ['淘宝买了件衣服200', 200, '淘宝买了件衣服'],
    ])('"%s" → expense ¥%s, merchant="%s"', (input, expectedAmount, expectedMerchant) => {
      const result = classifyIntent(input);
      expect(result.intent).toBe('add_expense');
      expect(result.agent).toBe('ledger');
      expect(result.params.amount).toBe(expectedAmount);
      expect(result.params.merchant).toContain(expectedMerchant);
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    test.each([
      '买了一杯奶茶12.5',
      '公交卡充值50元',
      '加油300',
      '房租2500',
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
      ['工资到账5000', 5000, '工资'],
      ['收入奖金3000', 3000, '奖金'],
      ['赚了200块', 200, ''],
      ['收入500', 500, ''],
      ['工资8000', 8000, '工资'],
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
      '今天花了多少',
      '查看概览',
      '本月消费统计',
      '支出情况',
      '账单汇总',
      '这个月花了多少',
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
      '嘿',
    ])('"%s" → greeting', (input) => {
      const result = classifyIntent(input);
      expect(result.intent).toBe('greeting');
    });
  });

  describe('safety queries', () => {
    test.each([
      ['安全扫描', 'safety_check', 'guardian'],
      ['检查安全风险', 'safety_check', 'guardian'],
      ['隐私报告', 'privacy_report', 'guardian'],
      ['数据分析', 'privacy_report', 'guardian'],
      ['订阅分析', 'subscriptions', 'guardian'],
      ['检查订阅', 'subscriptions', 'guardian'],
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
      ['查看储蓄进度', 'get_savings'],
      ['理财建议', 'get_advice'],
      ['省钱方法', 'get_advice'],
      ['连续记账天数', 'get_streak'],
      ['查看成就', 'get_achievements'],
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

  test('partial match has lower confidence', () => {
    const result = classifyIntent('我觉得午饭大概花了35块吧，可能记不太清了');
    expect(result.confidence).toBeLessThan(0.6);
  });

  test('prefers longer match over shorter match', () => {
    const match1 = classifyIntent('设置餐饮预算500');
    const match2 = classifyIntent('50');
    expect(match1.confidence).toBeGreaterThan(match2.confidence);
  });
});
