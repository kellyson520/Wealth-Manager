import { AggregateRoot, DomainEvent } from '../../shared/DomainEvent';
import { Money } from '../../shared/Money';

export class BudgetLimitSetEvent extends DomainEvent {
  readonly eventType = 'BudgetLimitSet';
  constructor(readonly aggregateId: string, readonly category: string, readonly limit: number) { super(); }
}

export class BudgetOverrunEvent extends DomainEvent {
  readonly eventType = 'BudgetOverrun';
  constructor(readonly aggregateId: string, readonly category: string, readonly spent: number, readonly limit: number) { super(); }
}

export class SavingsGoalCreatedEvent extends DomainEvent {
  readonly eventType = 'SavingsGoalCreated';
  constructor(readonly aggregateId: string, readonly name: string, readonly target: number) { super(); }
}

export class SavingsGoalCompletedEvent extends DomainEvent {
  readonly eventType = 'SavingsGoalCompleted';
  constructor(readonly aggregateId: string) { super(); }
}

export interface BudgetLimit {
  category: string;
  limit: Money;
  period: 'monthly' | 'weekly';
}

export class BudgetPlan extends AggregateRoot {
  private readonly _limits: BudgetLimit[] = [];

  get limits(): ReadonlyArray<BudgetLimit> { return this._limits; }

  setLimit(category: string, amount: number, period: 'monthly' | 'weekly' = 'monthly'): void {
    const idx = this._limits.findIndex(l => l.category === category);
    const limit: BudgetLimit = { category, limit: new Money(amount), period };
    if (idx >= 0) { this._limits[idx] = limit; } else { this._limits.push(limit); }
    this.addEvent(new BudgetLimitSetEvent(category, category, amount));
  }

  removeLimit(category: string): boolean {
    const idx = this._limits.findIndex(l => l.category === category);
    if (idx < 0) return false;
    this._limits.splice(idx, 1);
    return true;
  }

  checkOverrun(category: string, spent: number): 'OK' | 'WARNING' | 'OVERRUN' | 'NO_LIMIT' {
    const limit = this._limits.find(l => l.category === category);
    if (!limit) return 'NO_LIMIT';
    const pct = spent / limit.limit.amount;
    if (pct > 1.0) return 'OVERRUN';
    if (pct > 0.8) return 'WARNING';
    return 'OK';
  }
}

export class SavingsGoal extends AggregateRoot {
  private _currentAmount: Money;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly targetAmount: Money,
    currentAmount: number,
    readonly deadline?: string,
    readonly createdAt: string = new Date().toISOString(),
  ) {
    super();
    this._currentAmount = new Money(currentAmount);
  }

  contribute(amount: number): void {
    this._currentAmount = this._currentAmount.add(new Money(amount));
    if (this.isCompleted()) {
      this.addEvent(new SavingsGoalCompletedEvent(this.id));
    }
  }

  get currentAmount(): number { return this._currentAmount.amount; }

  progressPercent(): number {
    if (this.targetAmount.amount === 0) return 100;
    return Math.min(100, Math.round((this._currentAmount.amount / this.targetAmount.amount) * 100));
  }

  isCompleted(): boolean { return this._currentAmount.amount >= this.targetAmount.amount; }

  static create(name: string, targetAmount: number, deadline?: string): SavingsGoal {
    const id = `goal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const goal = new SavingsGoal(id, name, new Money(targetAmount), 0, deadline);
    goal.addEvent(new SavingsGoalCreatedEvent(id, name, targetAmount));
    return goal;
  }
}
