import { AggregateRoot, DomainEvent } from '../../shared/DomainEvent';
import { Money } from '../../shared/Money';
import type { BillType, BillSource, BillProps, RecordBillCommand } from '../types';

export class BillRecordedEvent extends DomainEvent {
  readonly eventType = 'BillRecorded';
  constructor(
    readonly aggregateId: string,
    readonly amount: number,
    readonly type: BillType,
    readonly category: string,
    readonly merchant: string,
    readonly date: string,
  ) {
    super();
  }
}

export class BillModifiedEvent extends DomainEvent {
  readonly eventType = 'BillModified';
  constructor(
    readonly aggregateId: string,
    readonly field: string,
    readonly oldValue: unknown,
    readonly newValue: unknown,
  ) {
    super();
  }
}

export class BillDeletedEvent extends DomainEvent {
  readonly eventType = 'BillDeleted';
  constructor(
    readonly aggregateId: string,
    readonly amount: number,
    readonly category: string,
  ) {
    super();
  }
}

export class BillCategoryCorrectedEvent extends DomainEvent {
  readonly eventType = 'BillCategoryCorrected';
  constructor(
    readonly aggregateId: string,
    readonly merchant: string,
    readonly originalCategory: string,
    readonly correctedCategory: string,
  ) {
    super();
  }
}

export class Bill extends AggregateRoot {
  private _amount: Money;
  private _category: string;
  private _merchant: string;
  private _date: string;
  private _note: string;
  private _type: BillType;

  constructor(
    readonly id: string,
    amount: number,
    type: BillType,
    category: string,
    merchant: string,
    date: string,
    note: string,
    readonly source: BillSource,
    readonly tags: string[],
    readonly createdAt: string,
  ) {
    super();
    this._amount = new Money(amount);
    this._type = type;
    this._category = category || '其他';
    this._merchant = merchant || '未命名';
    this._date = date || new Date().toISOString().split('T')[0];
    this._note = note || '';
  }

  static record(cmd: RecordBillCommand): Bill {
    const now = new Date().toISOString();
    const bill = new Bill(
      `bill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      cmd.amount,
      cmd.type,
      cmd.category || '其他',
      cmd.merchant || '',
      cmd.date || now.split('T')[0],
      cmd.note || '',
      cmd.source || 'manual',
      [],
      now,
    );

    bill.addEvent(new BillRecordedEvent(
      bill.id, cmd.amount, cmd.type,
      bill._category, bill._merchant, bill._date,
    ));

    return bill;
  }

  modifyAmount(newValue: number): void {
    const oldValue = this._amount.amount;
    this._amount = new Money(newValue);
    this.addEvent(new BillModifiedEvent(this.id, 'amount', oldValue, newValue));
  }

  modifyCategory(newValue: string): void {
    const oldValue = this._category;
    this._category = newValue;
    this.addEvent(new BillModifiedEvent(this.id, 'category', oldValue, newValue));
  }

  modifyMerchant(newValue: string): void {
    const oldValue = this._merchant;
    this._merchant = newValue;
    this.addEvent(new BillModifiedEvent(this.id, 'merchant', oldValue, newValue));
  }

  modifyNote(newValue: string): void {
    const oldValue = this._note;
    this._note = newValue;
    this.addEvent(new BillModifiedEvent(this.id, 'note', oldValue, newValue));
  }

  modifyDate(newValue: string): void {
    const oldValue = this._date;
    this._date = newValue;
    this.addEvent(new BillModifiedEvent(this.id, 'date', oldValue, newValue));
  }

  modifyType(newValue: BillType): void {
    const oldValue = this._type;
    this._type = newValue;
    this.addEvent(new BillModifiedEvent(this.id, 'type', oldValue, newValue));
  }

  correctCategory(correctedCategory: string): void {
    const original = this._category;
    this._category = correctedCategory;
    this.addEvent(new BillCategoryCorrectedEvent(this.id, this._merchant, original, correctedCategory));
  }

  markDeleted(): void {
    this.addEvent(new BillDeletedEvent(this.id, this._amount.amount, this._category));
  }

  get amount(): number { return this._amount.amount; }
  get type(): BillType { return this._type; }
  get category(): string { return this._category; }
  get merchant(): string { return this._merchant; }
  get date(): string { return this._date; }
  get note(): string { return this._note; }

  toProps(): BillProps {
    return {
      id: this.id,
      amount: this._amount.amount,
      type: this._type,
      category: this._category,
      merchant: this._merchant,
      date: this._date,
      note: this._note,
      source: this.source,
      tags: this.tags,
      createdAt: this.createdAt,
    };
  }

  static fromProps(props: BillProps): Bill {
    return new Bill(
      props.id, props.amount, props.type, props.category,
      props.merchant, props.date, props.note,
      props.source, props.tags, props.createdAt,
    );
  }
}
