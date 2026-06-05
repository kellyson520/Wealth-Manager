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

  test('extracts multiple budget verbs from model fuzzing', () => {
    const result = classifyIntent('把餐饮预算调到1600，娱乐预算设为400，咖啡预算300');
    expect(result.intent).toBe('set_budget');
    expect(result.params.budgets).toEqual([
      { category: '餐饮', limit: 1600 },
      { category: '娱乐', limit: 400 },
      { category: '咖啡', limit: 300 },
    ]);
  });

  test('extracts multiple assets from semicolon-separated balances', () => {
    const result = classifyIntent('招商银行活期余额23000，加到资产里；支付宝余额还有860');
    expect(result.intent).toBe('add_asset');
    expect(result.params.assets).toEqual([
      { name: '招商银行活期', amount: 23000, type: '银行账户' },
      { name: '支付宝', amount: 860, type: '银行账户' },
    ]);
  });

  test('routes weekday budget reminder with cron weekday field', () => {
    const result = classifyIntent('每个工作日早上8:30提醒我看预算');
    expect(result.intent).toBe('create_reminder');
    expect(result.agent).toBe('guardian');
    expect(result.params.cron).toBe('30 8 * * 1-5');
  });

  test('extracts credit card details with wan amount', () => {
    const result = classifyIntent('信用卡招商金卡额度5万，账单日10号还款日28号');
    expect(result.intent).toBe('credit_card');
    expect(result.agent).toBe('ledger');
    expect(result.params.bank).toBe('招商');
    expect(result.params.name).toBe('金卡');
    expect(result.params.creditLimit).toBe(50000);
    expect(result.params.billDay).toBe(10);
    expect(result.params.paymentDay).toBe(28);
  });

  test('keeps legacy credit card add format working', () => {
    const result = classifyIntent('添加信用卡 招行 50000');
    expect(result.intent).toBe('credit_card');
    expect(result.params.bank).toBe('招行');
    expect(result.params.creditLimit).toBe(50000);
  });

  test('routes bill category modification to ledger', () => {
    const result = classifyIntent('刚才那笔奶茶改成餐饮');
    expect(result.intent).toBe('modify_bill');
    expect(result.agent).toBe('ledger');
    expect(result.params.keyword).toBe('奶茶');
    expect(result.params.category).toBe('餐饮');
  });

  test('keeps no-date compact import text from batch import request', () => {
    const result = classifyIntent('全家19.8；滴滴28.5；麦当劳32.1 这些帮我批量导入');
    expect(result.intent).toBe('import_bills');
    expect(result.params.rawText).toBe('全家19.8；滴滴28.5；麦当劳32.1');
  });

  test('parses colloquial Chinese income amount from Mimo fuzzing', () => {
    const result = classifyIntent('发工资了，一万二');
    expect(result.intent).toBe('add_income');
    expect(result.agent).toBe('ledger');
    expect(result.params.amount).toBe(12000);
  });

  test.each([
    ['预算还剩多少啊', 'get_budget_status', 'analyst'],
    ['检查账户安全吗', 'safety_check', 'guardian'],
    ['订阅服务有哪些', 'subscriptions', 'guardian'],
    ['查看所有提醒', 'get_reminders', 'guardian'],
    ['列出所有资产', 'list_assets', 'ledger'],
    ['查看债务列表', 'list_debts', 'ledger'],
    ['同步数据到网页版', 'sync_webdav', 'guardian'],
    ['验证数据链完整', 'verify_chain', 'guardian'],
    ['有啥财务洞察', 'proactive_insights', 'coach'],
    ['最常去的商店是哪', 'get_merchants', 'analyst'],
    ['去年总支出多少', 'get_yearly', 'analyst'],
    ['攒钱目标：买车', 'create_savings_goal', 'coach'],
    ['提醒我明天交房租', 'create_reminder', 'guardian'],
    ['改一下昨天那笔账', 'modify_bill', 'ledger'],
    ['删除上个月的零食开销', 'delete_bill', 'guardian'],
    ['信用卡账单快到期了', 'credit_card', 'ledger'],
  ])('routes Mimo fuzz case "%s" to %s/%s', (input, expectedIntent, expectedAgent) => {
    const result = classifyIntent(input);
    expect(result.intent).toBe(expectedIntent);
    expect(result.agent).toBe(expectedAgent);
  });

  test('extracts house asset value with wan unit from Mimo fuzzing', () => {
    const result = classifyIntent('添加房子，值200万');
    expect(result.intent).toBe('add_asset');
    expect(result.params.name).toBe('房子');
    expect(result.params.amount).toBe(2000000);
    expect(result.params.type).toBe('房产');
  });

  test.each([
    ['欠朋友3000块', '借入', '朋友', 3000],
    ['朋友欠我三千', '借出', '朋友', 3000],
  ])('extracts informal debt "%s"', (input, expectedType, expectedCounterparty, expectedPrincipal) => {
    const result = classifyIntent(input);
    expect(result.intent).toBe('add_debt');
    expect(result.params.type).toBe(expectedType);
    expect(result.params.counterparty).toBe(expectedCounterparty);
    expect(result.params.principal).toBe(expectedPrincipal);
  });

  test('routes reimbursement before generic expense and extracts amount', () => {
    const result = classifyIntent('报销打车费80元');
    expect(result.intent).toBe('reimbursement');
    expect(result.agent).toBe('ledger');
    expect(result.params.title).toBe('打车费');
    expect(result.params.amount).toBe(80);
    expect(result.params.category).toBe('交通');
  });

  test.each([
    ['昨天买菜的记录在哪里', 'search_bills', 'ledger'],
    ['用图表看看消费分布', 'get_chart', 'analyst'],
    ['给餐饮设个3000的预算', 'set_budget', 'coach'],
    ['给旅行设个预算', 'set_budget', 'coach'],
    ['我的旅行基金存了多少', 'get_savings', 'coach'],
    ['怎么控制消费比较好', 'get_advice', 'coach'],
    ['怎样避免月光', 'get_advice', 'coach'],
    ['查看自动续费项目', 'subscriptions', 'guardian'],
    ['哪些订阅快到期了', 'subscriptions', 'guardian'],
    ['每月5号提醒还信用卡', 'create_reminder', 'guardian'],
    ['我设置了哪些提醒', 'get_reminders', 'guardian'],
    ['删掉周末聚餐提醒', 'delete_reminder', 'guardian'],
    ['分析我的消费习惯', 'proactive_insights', 'coach'],
    ['验证账本数据链', 'verify_chain', 'guardian'],
    ['添加一个股票账户', 'add_asset', 'ledger'],
    ['我有哪些外债', 'list_debts', 'ledger'],
    ['给消费加个标签', 'add_tag', 'ledger'],
    ['导入银行流水', 'import_bills', 'ledger'],
    ['提交报销单', 'reimbursement', 'ledger'],
    ['交通费这几个月趋势', 'get_category_trend', 'analyst'],
    ['有没有比平时多花很多的记录', 'get_anomaly', 'analyst'],
    ['哪个超市去得最多', 'get_merchants', 'analyst'],
    ['画个月消费对比图', 'get_chart', 'analyst'],
    ['娱乐预算超支了吗', 'get_budget_status', 'analyst'],
    ['算算我还有多少流动资金', 'get_net_balance', 'analyst'],
    ['打卡第几天了', 'get_streak', 'coach'],
    ['检查账本数据是否完整', 'verify_chain', 'guardian'],
    ['看看我有哪些账户', 'list_assets', 'ledger'],
    ['新增一个基金账户', 'add_asset', 'ledger'],
    ['你记住了我什么', 'list_ai_memories', 'master'],
    ['查看AI记忆', 'list_ai_memories', 'master'],
    ['关闭自动学习', 'set_ai_learning_enabled', 'master'],
    ['开启自学习', 'set_ai_learning_enabled', 'master'],
    ['严谨一点', 'update_ai_persona', 'master'],
    ['请记住：以后回复简洁一点', 'remember_user_preference', 'master'],
  ])('routes second-pass Mimo fuzz case "%s" to %s/%s', (input, expectedIntent, expectedAgent) => {
    const result = classifyIntent(input);
    expect(result.intent).toBe(expectedIntent);
    expect(result.agent).toBe(expectedAgent);
  });
});
