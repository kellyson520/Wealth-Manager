import { Money } from '../../../domain/shared/Money';
import { DateRange } from '../../../domain/shared/DateRange';
import { Bill, BillRecordedEvent, BillModifiedEvent, BillDeletedEvent } from '../../../domain/billing/aggregates/Bill';
import { BillingService } from '../../../application/BillingService';
import type { BillRepository } from '../../../domain/billing/repositories/BillRepository';

function createMockRepo(): jest.Mocked<BillRepository> {
  return {
    save: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(null),
    search: jest.fn().mockResolvedValue([]),
    findByDateRange: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ totalIncome: 0, totalExpense: 0, billCount: 0, byCategory: {} }),
    delete: jest.fn().mockResolvedValue(true),
    getCategoryTotals: jest.fn().mockResolvedValue({}),
    getMonthlyComparison: jest.fn().mockResolvedValue([]),
    getMerchantRanking: jest.fn().mockResolvedValue([]),
    getDailyExpenses: jest.fn().mockResolvedValue([]),
    getDistinctCategories: jest.fn().mockResolvedValue([]),
  };
}

describe('Money (Value Object)', () => {
  it('should create with default currency CNY', () => {
    const m = new Money(100);
    expect(m.amount).toBe(100);
    expect(m.currency).toBe('CNY');
  });

  it('should round to 2 decimal places', () => {
    const m = new Money(100.456);
    expect(m.amount).toBe(100.46);
  });

  it('should allow negative amounts (for negate/debt)', () => {
    const m = new Money(-100);
    expect(m.amount).toBe(-100);
  });

  it('should reject amounts over 99999999', () => {
    expect(() => new Money(100000000)).toThrow();
    expect(() => new Money(-100000000)).toThrow();
  });

  it('should reject non-finite amounts', () => {
    expect(() => new Money(NaN)).toThrow();
    expect(() => new Money(Infinity)).toThrow();
  });

  it('should add two Money values', () => {
    const result = new Money(50).add(new Money(30));
    expect(result.amount).toBe(80);
  });

  it('should subtract two Money values', () => {
    const result = new Money(100).subtract(new Money(30));
    expect(result.amount).toBe(70);
  });

  it('should compute percentage correctly', () => {
    const pct = new Money(30).percentageOf(new Money(100));
    expect(pct).toBe(30);
  });

  it('should create zero', () => {
    expect(Money.zero().amount).toBe(0);
  });

  it('should detect zero', () => {
    expect(new Money(0).isZero()).toBe(true);
    expect(new Money(1).isZero()).toBe(false);
  });
});

describe('DateRange (Value Object)', () => {
  it('should create valid range', () => {
    const range = new DateRange('2026-01-01', '2026-01-31');
    expect(range.start).toBe('2026-01-01');
  });

  it('should reject invalid range', () => {
    expect(() => new DateRange('2026-02-01', '2026-01-01')).toThrow();
  });

  it('should check containment', () => {
    const range = new DateRange('2026-01-01', '2026-01-31');
    expect(range.contains('2026-01-15')).toBe(true);
    expect(range.contains('2026-02-01')).toBe(false);
  });

  it('should create thisMonth', () => {
    const range = DateRange.thisMonth();
    expect(range.start <= range.end).toBe(true);
  });

  it('should create lastDays', () => {
    const range = DateRange.lastDays(7);
    expect(range.start <= range.end).toBe(true);
  });
});

describe('Bill (Aggregate Root)', () => {
  it('should record a new bill', () => {
    const bill = Bill.record({
      amount: 35,
      type: 'expense',
      merchant: '午餐',
      category: '餐饮',
    });

    expect(bill.amount).toBe(35);
    expect(bill.category).toBe('餐饮');
    expect(bill.domainEvents).toHaveLength(1);
    expect(bill.domainEvents[0]).toBeInstanceOf(BillRecordedEvent);
  });

  it('should set default category when not provided', () => {
    const bill = Bill.record({ amount: 50, type: 'expense', merchant: 'test' });
    expect(bill.category).toBe('其他');
  });

  it('should modify amount and emit event', () => {
    const bill = Bill.record({ amount: 100, type: 'expense', merchant: 'test' });
    bill.modifyAmount(200);

    expect(bill.amount).toBe(200);
    const modifyEvents = bill.domainEvents.filter(e => e instanceof BillModifiedEvent);
    expect(modifyEvents).toHaveLength(1);
  });

  it('should modify category and emit event', () => {
    const bill = Bill.record({ amount: 50, type: 'expense', merchant: 'test' });
    bill.modifyCategory('交通');

    expect(bill.category).toBe('交通');
  });

  it('should correct category and emit event', () => {
    const bill = Bill.record({ amount: 50, type: 'expense', merchant: 'test', category: '餐饮' });
    bill.correctCategory('交通');

    expect(bill.category).toBe('交通');
  });

  it('should mark deleted and emit event', () => {
    const bill = Bill.record({ amount: 50, type: 'expense', merchant: 'test' });
    bill.markDeleted();

    const deleteEvents = bill.domainEvents.filter(e => e instanceof BillDeletedEvent);
    expect(deleteEvents).toHaveLength(1);
  });

  it('should clear events', () => {
    const bill = Bill.record({ amount: 50, type: 'expense', merchant: 'test' });
    expect(bill.domainEvents.length).toBeGreaterThan(0);
    bill.clearEvents();
    expect(bill.domainEvents).toHaveLength(0);
  });

  it('should serialize to props and back', () => {
    const bill = Bill.record({ amount: 100, type: 'income', merchant: '工资', category: '工资' });
    const props = bill.toProps();
    const restored = Bill.fromProps(props);

    expect(restored.id).toBe(bill.id);
    expect(restored.amount).toBe(bill.amount);
    expect(restored.type).toBe(bill.type);
    expect(restored.category).toBe(bill.category);
  });
});

describe('BillingService (Application Service)', () => {
  let repo: jest.Mocked<BillRepository>;
  let service: BillingService;

  beforeEach(() => {
    repo = createMockRepo();
    service = new BillingService(repo);
  });

  it('should record a bill via repository', async () => {
    const bill = await service.recordBill({ amount: 35, type: 'expense', merchant: '午餐' });
    expect(repo.save).toHaveBeenCalled();
    expect(bill.amount).toBe(35);
  });

  it('should reject invalid amount', async () => {
    await expect(
      service.recordBill({ amount: -1, type: 'expense', merchant: 'x' })
    ).rejects.toThrow('金额必须在');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('should search bills', async () => {
    repo.search.mockResolvedValue([]);
    const results = await service.searchBills({ keyword: 'test' });
    expect(repo.search).toHaveBeenCalledWith({ keyword: 'test' });
    expect(results).toEqual([]);
  });

  it('should modify a bill', async () => {
    const bill = Bill.record({ amount: 100, type: 'expense', merchant: 'old' });
    repo.findById.mockResolvedValue(bill);

    const updated = await service.modifyBill(bill.id, { amount: 200 });
    expect(updated.amount).toBe(200);
    expect(repo.save).toHaveBeenCalled();
  });

  it('should throw when modifying nonexistent bill', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      service.modifyBill('nonexistent', { amount: 200 })
    ).rejects.toThrow('账单不存在');
  });

  it('should delete a bill', async () => {
    const bill = Bill.record({ amount: 100, type: 'expense', merchant: 'test' });
    repo.findById.mockResolvedValue(bill);

    await service.deleteBill(bill.id);
    expect(repo.delete).toHaveBeenCalledWith(bill.id);
  });
});
