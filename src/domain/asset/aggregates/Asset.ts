import { AggregateRoot, DomainEvent } from '../../shared/DomainEvent';
import { Money } from '../../shared/Money';

export class AssetValueChangedEvent extends DomainEvent {
  readonly eventType = 'AssetValueChanged';
  constructor(readonly aggregateId: string, readonly oldValue: number, readonly newValue: number) { super(); }
}

export class DebtRepaidEvent extends DomainEvent {
  readonly eventType = 'DebtRepaid';
  constructor(readonly aggregateId: string, readonly amount: number) { super(); }
}

export class Asset extends AggregateRoot {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly type: 'cash' | 'bank' | 'stock' | 'fund' | 'real_estate' | 'vehicle' | 'credit_card' | 'other',
    private _amount: Money,
    readonly note: string = '',
    readonly createdAt: string = new Date().toISOString(),
  ) { super(); }

  updateValue(newAmount: number): void {
    const old = this._amount.amount;
    this._amount = new Money(newAmount);
    this.addEvent(new AssetValueChangedEvent(this.id, old, newAmount));
  }

  get amount(): number { return this._amount.amount; }
}

export class Debt extends AggregateRoot {
  private _remaining: Money;

  constructor(
    readonly id: string,
    readonly title: string,
    readonly type: '借出' | '借入',
    readonly principal: Money,
    remaining: number,
    readonly counterparty: string,
    readonly interestRate: number = 0,
    readonly startDate: string = new Date().toISOString().split('T')[0],
    readonly dueDate?: string,
    readonly createdAt: string = new Date().toISOString(),
  ) {
    super();
    this._remaining = new Money(remaining);
  }

  recordRepayment(amount: number): void {
    this._remaining = this._remaining.subtract(new Money(amount));
    this.addEvent(new DebtRepaidEvent(this.id, amount));
  }

  get remaining(): number { return this._remaining.amount; }
  get status(): 'active' | 'cleared' | 'overdue' {
    if (this._remaining.amount <= 0) return 'cleared';
    if (this.dueDate && new Date(this.dueDate) < new Date()) return 'overdue';
    return 'active';
  }
}
