export class Money {
  readonly amount: number;
  readonly currency: string;

  constructor(amount: number, currency: string = 'CNY') {
    if (!Number.isFinite(amount) || amount < 0 || amount > 99999999) {
      throw new Error(`Invalid money amount: ${amount}`);
    }
    this.amount = Math.round(amount * 100) / 100;
    this.currency = currency;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(Math.max(0, this.amount - other.amount), this.currency);
  }

  negate(): Money {
    return new Money(-this.amount, this.currency);
  }

  isZero(): boolean {
    return this.amount === 0;
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount > other.amount;
  }

  percentageOf(total: Money): number {
    if (total.amount === 0) return 0;
    return Math.round((this.amount / total.amount) * 10000) / 100;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  toString(): string {
    return `${this.currency} ${this.amount.toFixed(2)}`;
  }

  static zero(currency: string = 'CNY'): Money {
    return new Money(0, currency);
  }
}
