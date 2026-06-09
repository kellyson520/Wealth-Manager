jest.mock('../../../core/rules/rule-store', () => ({
  searchRules: jest.fn(),
  recordRuleHit: jest.fn().mockResolvedValue(undefined),
}));

import { matchRules } from '../../../core/rules/rule-engine';
import { searchRules } from '../../../core/rules/rule-store';
import type { ClassificationRule } from '../../../core/rules/rule-types';

const mockedSearchRules = searchRules as jest.MockedFunction<typeof searchRules>;

function rule(overrides: Partial<ClassificationRule>): ClassificationRule {
  return {
    id: 'rule-1',
    name: '测试规则',
    description: '',
    priority: 10,
    enabled: true,
    conditions: { operator: 'and', conditions: [] },
    actions: [{ type: 'set_category', target: 'category', value: '餐饮' }],
    createdAt: '2026-06-08T00:00:00.000Z',
    updatedAt: '2026-06-08T00:00:00.000Z',
    createdBy: 'user',
    hitCount: 0,
    ...overrides,
  };
}

describe('rule-engine matchRules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not match an AND rule when only one condition matches', async () => {
    mockedSearchRules.mockResolvedValue([
      rule({
        conditions: {
          operator: 'and',
          conditions: [
            { field: 'merchant', operator: 'contains', value: '咖啡' },
            { field: 'amount', operator: 'gt', value: 100 },
          ],
        },
      }),
    ]);

    const results = await matchRules({ merchant: '咖啡店', amount: 35 });

    expect(results).toEqual([]);
  });

  test('matches an OR rule when one condition matches', async () => {
    mockedSearchRules.mockResolvedValue([
      rule({
        conditions: {
          operator: 'or',
          conditions: [
            { field: 'merchant', operator: 'contains', value: '咖啡' },
            { field: 'amount', operator: 'gt', value: 100 },
          ],
        },
      }),
    ]);

    const results = await matchRules({ merchant: '咖啡店', amount: 35 });

    expect(results).toHaveLength(1);
    expect(results[0].confidence).toBe(1);
  });

  test('does not deflate confidence for large OR groups', async () => {
    const orConditions = [
      { field: 'merchant', operator: 'contains', value: '饭' } as const,
      { field: 'merchant', operator: 'contains', value: '餐' } as const,
      { field: 'merchant', operator: 'contains', value: '面' } as const,
      { field: 'merchant', operator: 'contains', value: '菜' } as const,
      { field: 'merchant', operator: 'contains', value: '奶茶' } as const,
      { field: 'merchant', operator: 'contains', value: '咖啡' } as const,
      { field: 'merchant', operator: 'contains', value: '外卖' } as const,
    ];
    mockedSearchRules.mockResolvedValue([
      rule({
        conditions: { operator: 'or', conditions: orConditions },
      }),
    ]);

    const results = await matchRules(
      { merchant: '瑞幸咖啡' },
      { minConfidence: 0.3 },
    );

    expect(results).toHaveLength(1);
    expect(results[0].confidence).toBe(1);
  });

  test('does not match comparison rules when the fact is missing', async () => {
    mockedSearchRules.mockResolvedValue([
      rule({
        conditions: {
          operator: 'and',
          conditions: [{ field: 'amount', operator: 'gt', value: 100 }],
        },
      }),
    ]);

    const results = await matchRules({ merchant: '咖啡店' });

    expect(results).toEqual([]);
  });

  test('does not treat blank string as zero for comparison rules', async () => {
    mockedSearchRules.mockResolvedValue([
      rule({
        conditions: {
          operator: 'and',
          conditions: [{ field: 'amount', operator: 'lt', value: 100 }],
        },
      }),
    ]);

    const results = await matchRules({ merchant: '咖啡店', amount: '' });

    expect(results).toEqual([]);
  });
});
