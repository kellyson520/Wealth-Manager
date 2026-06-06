import { classifyIntent } from '../../agents/master/nlu';
import {
  addNluLearningSampleForTest,
  inferIntentFromCorrectionTarget,
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

  test('infers learnable intent from user correction labels', () => {
    expect(inferIntentFromCorrectionTarget('设置预算')).toMatchObject({
      intent: 'set_budget',
      agent: 'coach',
    });
    expect(inferIntentFromCorrectionTarget('记一笔支出')).toMatchObject({
      intent: 'add_expense',
      agent: 'ledger',
    });
    expect(inferIntentFromCorrectionTarget('提醒')).toMatchObject({
      intent: 'create_reminder',
      agent: 'guardian',
    });
    expect(inferIntentFromCorrectionTarget('完全不知道')).toBeNull();
  });

  test('learned alias from user feedback improves future routing', () => {
    addNluLearningSampleForTest({
      text: '少买奶茶',
      intent: 'set_budget',
      agent: 'coach',
      source: 'user_feedback',
      confidence: 0.9,
    });

    const result = classifyIntent('少买奶茶');

    expect(result.intent).toBe('set_budget');
    expect(result.agent).toBe('coach');
  });

  test('learned alias gains confidence after repeated exact hits', () => {
    addNluLearningSampleForTest({
      text: '奶茶封印',
      intent: 'set_budget',
      agent: 'coach',
      source: 'user_feedback',
      confidence: 0.94,
    });

    const first = classifyIntent('奶茶封印');
    const second = classifyIntent('奶茶封印');

    expect(first.intent).toBe('set_budget');
    expect(second.confidence).toBeGreaterThan(first.confidence);
  });
});
