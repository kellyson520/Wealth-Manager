export abstract class DomainEvent {
  readonly occurredAt: string = new Date().toISOString();
  abstract readonly eventType: string;
  abstract readonly aggregateId: string;
}

export abstract class AggregateRoot {
  private _domainEvents: DomainEvent[] = [];

  protected addEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  get domainEvents(): readonly DomainEvent[] {
    return this._domainEvents;
  }

  clearEvents(): void {
    this._domainEvents = [];
  }
}
