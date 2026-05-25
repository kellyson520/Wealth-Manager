import { BudgetPlan, SavingsGoal, BudgetLimitSetEvent } from '../../../domain/budget/aggregates/BudgetPlan';
import { Asset, Debt } from '../../../domain/asset/aggregates/Asset';
import { Achievement, Streak } from '../../../domain/gamification/aggregates/Achievement';
import { RecurringTask } from '../../../domain/automation/aggregates/RecurringTask';
import { ClassificationRule } from '../../../domain/rules/aggregates/ClassificationRule';
import { Money } from '../../../domain/shared/Money';

describe('BudgetPlan (Aggregate)', () => {
  it('should set a budget limit', () => {
    const plan = new BudgetPlan();
    plan.setLimit('餐饮', 3000);
    expect(plan.limits).toHaveLength(1);
    expect(plan.limits[0].category).toBe('餐饮');
    expect(plan.domainEvents.some(e => e instanceof BudgetLimitSetEvent)).toBe(true);
  });

  it('should check overrun status', () => {
    const plan = new BudgetPlan();
    plan.setLimit('餐饮', 1000);
    expect(plan.checkOverrun('餐饮', 500)).toBe('OK');
    expect(plan.checkOverrun('餐饮', 850)).toBe('WARNING');
    expect(plan.checkOverrun('餐饮', 1100)).toBe('OVERRUN');
    expect(plan.checkOverrun('未知分类', 500)).toBe('NO_LIMIT');
  });

  it('should remove a limit', () => {
    const plan = new BudgetPlan();
    plan.setLimit('餐饮', 3000);
    expect(plan.removeLimit('餐饮')).toBe(true);
    expect(plan.limits).toHaveLength(0);
    expect(plan.removeLimit('nonexistent')).toBe(false);
  });

  it('should override existing limit', () => {
    const plan = new BudgetPlan();
    plan.setLimit('餐饮', 3000);
    plan.setLimit('餐饮', 5000);
    expect(plan.limits).toHaveLength(1);
    expect(plan.limits[0].limit.amount).toBe(5000);
  });
});

describe('SavingsGoal (Aggregate)', () => {
  it('should create a savings goal', () => {
    const goal = SavingsGoal.create('买车', 100000);
    expect(goal.name).toBe('买车');
    expect(goal.targetAmount.amount).toBe(100000);
    expect(goal.progressPercent()).toBe(0);
  });

  it('should track contributions and progress', () => {
    const goal = SavingsGoal.create('旅行', 5000);
    goal.contribute(2500);
    expect(goal.currentAmount).toBe(2500);
    expect(goal.progressPercent()).toBe(50);
  });

  it('should detect completion', () => {
    const goal = SavingsGoal.create('储蓄', 1000);
    goal.contribute(1000);
    expect(goal.isCompleted()).toBe(true);
    expect(goal.progressPercent()).toBe(100);
    expect(goal.domainEvents.length).toBe(2); // Created + Completed
  });
});

describe('Asset (Aggregate)', () => {
  it('should update value and emit event', () => {
    const asset = new Asset('a1', '工资卡', 'bank', new Money(5000));
    asset.updateValue(6000);
    expect(asset.amount).toBe(6000);
    expect(asset.domainEvents.length).toBe(1);
  });
});

describe('Debt (Aggregate)', () => {
  it('should record repayment', () => {
    const debt = new Debt('d1', '借款', '借入', new Money(10000), 10000, '张三');
    debt.recordRepayment(3000);
    expect(debt.remaining).toBe(7000);
    expect(debt.status).toBe('active');
  });

  it('should detect cleared status', () => {
    const debt = new Debt('d1', '借款', '借入', new Money(1000), 1000, '张三');
    debt.recordRepayment(1000);
    expect(debt.status).toBe('cleared');
  });
});

describe('Achievement (Aggregate)', () => {
  it('should add progress', () => {
    const achievement = new Achievement('a1', '记账达人', '累计记账100笔', 100);
    achievement.addProgress(50);
    expect(achievement.progress).toBe(50);
    expect(achievement.percent).toBe(50);
    expect(achievement.isUnlocked).toBe(false);
  });

  it('should unlock when progress reaches max', () => {
    const achievement = new Achievement('a1', '记账达人', '累计记账100笔', 100);
    achievement.addProgress(100);
    expect(achievement.isUnlocked).toBe(true);
    expect(achievement.domainEvents.length).toBe(1);
  });

  it('should not add progress after unlocking', () => {
    const achievement = new Achievement('a1', '记账达人', '累计记账100笔', 100);
    achievement.addProgress(100);
    achievement.addProgress(50);
    expect(achievement.progress).toBe(100);
  });
});

describe('Streak (Aggregate)', () => {
  it('should track consecutive days', () => {
    const streak = new Streak();
    streak.recordDay('2026-05-01');
    expect(streak.currentStreak).toBe(1);
    streak.recordDay('2026-05-02');
    expect(streak.currentStreak).toBe(2);
  });

  it('should reset on skipped day', () => {
    const streak = new Streak();
    streak.recordDay('2026-05-01');
    streak.recordDay('2026-05-02');
    streak.recordDay('2026-05-05');
    expect(streak.currentStreak).toBe(1);
    expect(streak.longestStreak).toBe(2);
  });
});

describe('RecurringTask (Aggregate)', () => {
  it('should detect trigger time', () => {
    const task = new RecurringTask('t1', '每日提醒', 'reminder', '-1 9 -1 -1 -1');
    const now = new Date(2026, 4, 25, 9, 0, 0);
    expect(task.shouldTrigger(now)).toBe(true);
  });

  it('should not trigger when disabled', () => {
    const task = new RecurringTask('t1', '每日提醒', 'reminder', '-1 9 -1 -1 -1');
    task.disable();
    const now = new Date(2026, 4, 25, 9, 0, 0);
    expect(task.shouldTrigger(now)).toBe(false);
  });
});

describe('ClassificationRule (Aggregate)', () => {
  it('should match simple condition', () => {
    const rule = new ClassificationRule('r1', '餐饮规则', 10, {
      operator: 'and',
      conditions: [{ field: 'merchant', operator: 'contains', value: '饭' }],
    }, []);

    const result = rule.match({ merchant: '午饭' });
    expect(result.matched).toBe(true);
  });

  it('should not match when disabled', () => {
    const rule = new ClassificationRule('r1', '餐饮规则', 10, {
      operator: 'and',
      conditions: [{ field: 'merchant', operator: 'contains', value: '饭' }],
    }, []);
    rule.disable();

    const result = rule.match({ merchant: '午饭' });
    expect(result.matched).toBe(false);
  });

  it('should match AND condition group', () => {
    const rule = new ClassificationRule('r1', '高额餐饮', 10, {
      operator: 'and',
      conditions: [
        { field: 'merchant', operator: 'contains', value: '餐厅' },
        { field: 'amount', operator: 'gt', value: 100 },
      ],
    }, []);

    expect(rule.match({ merchant: '餐厅', amount: 200 }).matched).toBe(true);
    expect(rule.match({ merchant: '餐厅', amount: 50 }).matched).toBe(false);
  });
});
