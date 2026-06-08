import { classifyIntent } from '../../agents/master/nlu';
import {
  addNluLearningSampleForTest,
  inferIntentFromToolCall,
  resetNluLearningForTest,
} from '../../agents/master/nlu-learning';

describe('NLU learning layer', () => {
  beforeEach(() => {
    resetNluLearningForTest();
  });

  afterEach(() => {
    resetNluLearningForTest();
  });

  test('learned exact alias can route an otherwise unknown phrase', () => {
    addNluLearningSampleForTest({
      text: '别让我买太多盲盒',
      intent: 'set_budget',
      agent: 'coach',
      params: { category: '娱乐', limit: 300 },
      confidence: 0.9,
    });

    const result = classifyIntent('别让我买太多盲盒');

    expect(result.intent).toBe('set_budget');
    expect(result.agent).toBe('coach');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.params).toEqual({ category: '娱乐', limit: 300 });
  });

  test('learned fuzzy alias only helps low-confidence phrases', () => {
    addNluLearningSampleForTest({
      text: '少买盲盒',
      intent: 'set_budget',
      agent: 'coach',
      params: { category: '娱乐', limit: 300 },
    });

    const result = classifyIntent('这个月少买盲盒吧');

    expect(result.intent).toBe('set_budget');
    expect(result.agent).toBe('coach');
  });

  test('learned aliases do not replay confirmation flags', () => {
    addNluLearningSampleForTest({
      text: '删掉那笔错误账单',
      intent: 'delete_bill',
      agent: 'guardian',
      params: { billId: 'bill-1', confirmed: true, userConfirmed: true },
    });

    const result = classifyIntent('删掉那笔错误账单');

    expect(result.params).toMatchObject({ billId: 'bill-1', confirmed: false });
    expect(result.params).not.toHaveProperty('userConfirmed');
  });

  test('current parsed params override learned alias params', () => {
    addNluLearningSampleForTest({
      text: '午饭',
      intent: 'add_expense',
      agent: 'ledger',
      params: { amount: 20, category: '餐饮' },
    });

    const result = classifyIntent('午饭花了35块');

    expect(result.params.amount).toBe(35);
  });

  test('infers learnable intent from cloud tool calls', () => {
    expect(inferIntentFromToolCall('add_bill', { type: 'income', amount: 12000 })).toMatchObject({
      intent: 'add_income',
      agent: 'ledger',
    });
    expect(inferIntentFromToolCall('set_budget', { category: '餐饮', limit: 2000 })).toMatchObject({
      intent: 'set_budget',
      agent: 'coach',
    });
    expect(inferIntentFromToolCall('unknown_tool', {})).toBeNull();
  });
});
