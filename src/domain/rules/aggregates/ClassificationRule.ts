import { AggregateRoot, DomainEvent } from '../../shared/DomainEvent';

export class RuleMatchedEvent extends DomainEvent {
  readonly eventType = 'RuleMatched';
  constructor(readonly aggregateId: string, readonly facts: Record<string, unknown>, readonly confidence: number) { super(); }
}

export interface Condition {
  field: string;
  operator: 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte';
  value: unknown;
}

export interface ConditionGroup {
  operator: 'and' | 'or';
  conditions: Condition[];
}

export class ClassificationRule extends AggregateRoot {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly priority: number,
    readonly conditionGroup: ConditionGroup,
    readonly actions: { type: string; target: string; value: unknown }[],
    private _enabled: boolean = true,
    readonly createdBy?: string,
    readonly createdAt: string = new Date().toISOString(),
  ) { super(); }

  match(facts: Record<string, unknown>): { matched: boolean; confidence: number } {
    if (!this._enabled) return { matched: false, confidence: 0 };
    const result = this.evaluateGroup(this.conditionGroup, facts);
    if (result > 0) {
      this.addEvent(new RuleMatchedEvent(this.id, facts, result));
    }
    return { matched: result > 0, confidence: result };
  }

  private evaluateGroup(group: ConditionGroup, facts: Record<string, unknown>): number {
    const results = group.conditions.map(c => this.evaluate(c, facts));
    if (group.operator === 'and') {
      const allMatch = results.every(r => r > 0);
      return allMatch ? results.reduce((a, b) => a + b, 0) / results.length : 0;
    }
    return Math.max(...results);
  }

  private evaluate(cond: Condition, facts: Record<string, unknown>): number {
    if (['__proto__', 'constructor', 'prototype'].includes(cond.field)) return 0;
    const actual = Object.hasOwn(facts, cond.field) ? facts[cond.field] : undefined;
    const expected = cond.value;
    let match: boolean;
    switch (cond.operator) {
      case 'eq': match = actual === expected || String(actual) === String(expected); break;
      case 'neq': match = actual !== expected; break;
      case 'contains': match = typeof actual === 'string' && actual.includes(String(expected)); break;
      case 'gt': match = Number(actual) > Number(expected); break;
      case 'lt': match = Number(actual) < Number(expected); break;
      case 'gte': match = Number(actual) >= Number(expected); break;
      case 'lte': match = Number(actual) <= Number(expected); break;
      default: match = false;
    }
    return match ? 1 : 0;
  }

  enable(): void { this._enabled = true; }
  disable(): void { this._enabled = false; }
  get isEnabled(): boolean { return this._enabled; }
}
