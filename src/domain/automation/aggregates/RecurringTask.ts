import { AggregateRoot, DomainEvent } from '../../shared/DomainEvent';

export class TaskTriggeredEvent extends DomainEvent {
  readonly eventType = 'TaskTriggered';
  constructor(readonly aggregateId: string, readonly type: string) { super(); }
}

export class RecurringTask extends AggregateRoot {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly type: 'reminder' | 'backup' | 'report',
    readonly cronExpression: string,
    private _enabled: boolean = true,
    private _lastTriggered?: string,
    readonly createdAt: string = new Date().toISOString(),
  ) { super(); }

  shouldTrigger(now: Date = new Date()): boolean {
    if (!this._enabled) return false;
    return this.matchesCron(now);
  }

  recordTrigger(): void {
    this._lastTriggered = new Date().toISOString();
    this.addEvent(new TaskTriggeredEvent(this.id, this.type));
  }

  enable(): void { this._enabled = true; }
  disable(): void { this._enabled = false; }
  get isEnabled(): boolean { return this._enabled; }

  private matchesCron(now: Date): boolean {
    const parts = this.cronExpression.trim().split(/\s+/);
    if (parts.length < 5) return false;
    const minute = parseInt(parts[0], 10);
    const hour = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    const month = parseInt(parts[3], 10);
    const dayOfWeek = parseInt(parts[4], 10);

    const isMatch = (cron: number, actual: number) => cron === -1 || cron === actual;

    return (
      isMatch(minute, now.getMinutes()) &&
      isMatch(hour, now.getHours()) &&
      isMatch(day, now.getDate()) &&
      isMatch(month, now.getMonth() + 1) &&
      isMatch(dayOfWeek, now.getDay())
    );
  }
}
