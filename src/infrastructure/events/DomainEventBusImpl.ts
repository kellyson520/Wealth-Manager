import { DomainEvent } from '../../domain/shared/DomainEvent';
import { messageBus } from '../../core/message-bus';
import { captureError } from '../../core/logger/logger';
import type { AgentId } from '../../shared/types';

export interface DomainEventBus {
  publish(event: DomainEvent): Promise<void>;
  publishAll(events: DomainEvent[]): Promise<void>;
  subscribe<T extends DomainEvent>(
    eventClass: new (...args: any[]) => T,
    handler: (event: T) => Promise<void>
  ): () => void;
}

class DomainEventBusImpl implements DomainEventBus {
  private handlerMap = new Map<string, Set<(...args: any[]) => Promise<void>>>();

  async publish(event: DomainEvent): Promise<void> {
    await messageBus.publish({
      from: 'system' as AgentId,
      to: 'broadcast',
      type: 'event',
      payload: {
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        data: event,
      },
    });
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  subscribe<T extends DomainEvent>(
    eventClass: new (...args: any[]) => T,
    handler: (event: T) => Promise<void>
  ): () => void {
    const sample = new (eventClass as any)();
    const eventType: string = sample.eventType;

    if (!this.handlerMap.has(eventType)) {
      this.handlerMap.set(eventType, new Set());
    }

    const wrapped = async (msg: Parameters<Parameters<typeof messageBus.subscribe>[1]>[0]) => {
      const payload = msg.payload as { eventType: string; data: unknown };
      if (payload.eventType === eventType) {
        try {
          await handler(payload.data as T);
        } catch (e) {
          captureError(
            'DomainEventBus',
            e,
            `Handler failed for event ${eventType}`
          );
        }
      }
    };

    this.handlerMap.get(eventType)!.add(wrapped);
    const unsub = messageBus.subscribe('system' as AgentId, wrapped);

    return () => {
      this.handlerMap.get(eventType)?.delete(wrapped);
      unsub();
    };
  }
}

export const domainEventBus: DomainEventBus = new DomainEventBusImpl();
