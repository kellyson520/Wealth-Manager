import { v4 as uuidv4 } from 'uuid';
import type { AgentId } from '../../shared/types';
import { moveToDeadLetter } from './dead-letter';
import { captureError } from '../logger/logger';

export interface BusMessage {
  id: string;
  from: AgentId;
  to: AgentId | 'broadcast';
  type: 'request' | 'response' | 'event' | 'error';
  payload: Record<string, unknown>;
  correlationId?: string;
  createdAt: string;
}

export type MessageHandler = (msg: BusMessage) => Promise<void>;

export interface BusStats {
  totalPublished: number;
  totalDelivered: number;
  totalDeadLettered: number;
  activeSubscriptions: number;
}

class MessageBusImpl {
  private handlers = new Map<string, Set<MessageHandler>>();
  private stats: BusStats = {
    totalPublished: 0,
    totalDelivered: 0,
    totalDeadLettered: 0,
    activeSubscriptions: 0,
  };

  private key(agentId: AgentId): string {
    return `agent:${agentId}`;
  }

  subscribe(agentId: AgentId, handler: MessageHandler): () => void {
    const k = this.key(agentId);
    if (!this.handlers.has(k)) {
      this.handlers.set(k, new Set());
    }
    this.handlers.get(k)!.add(handler);
    this.stats.activeSubscriptions = this.countAllHandlers();
    return () => this.unsubscribe(agentId, handler);
  }

  unsubscribe(agentId: AgentId, handler: MessageHandler): void {
    const k = this.key(agentId);
    this.handlers.get(k)?.delete(handler);
    if (this.handlers.get(k)?.size === 0) {
      this.handlers.delete(k);
    }
    this.stats.activeSubscriptions = this.countAllHandlers();
  }

  async publish(msg: Omit<BusMessage, 'id' | 'createdAt'>): Promise<void> {
    const fullMsg: BusMessage = {
      ...msg,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };

    this.stats.totalPublished++;

    const targets: AgentId[] =
      msg.to === 'broadcast'
        ? (Array.from(this.handlers.keys())
            .map((k) => k.replace('agent:', '') as AgentId)
            .filter((id) => id !== msg.from))
        : [msg.to];

    const deliveries: Promise<void>[] = [];

    for (const target of targets) {
      const handlers = this.handlers.get(this.key(target));
      if (!handlers || handlers.size === 0) continue;

      for (const handler of handlers) {
        deliveries.push(
          this.deliver(handler, fullMsg, target)
        );
      }
    }

    if (deliveries.length === 0 && msg.to !== 'broadcast') {
      const errorMsg = `No subscribers for target: ${msg.to}`;
      captureError('MessageBus.publish', new Error(errorMsg), errorMsg);
    }

    await Promise.allSettled(deliveries);
  }

  private async deliver(
    handler: MessageHandler,
    msg: BusMessage,
    target: AgentId
  ): Promise<void> {
    try {
      await handler(msg);
      this.stats.totalDelivered++;
    } catch (e) {
      this.stats.totalDeadLettered++;
      await moveToDeadLetter(msg, target, e instanceof Error ? e.message : 'Unknown error');
    }
  }

  getStats(): BusStats {
    return { ...this.stats };
  }

  reset(): void {
    this.handlers.clear();
    this.stats = {
      totalPublished: 0,
      totalDelivered: 0,
      totalDeadLettered: 0,
      activeSubscriptions: 0,
    };
  }

  getSubscriberCount(agentId?: AgentId): number {
    if (agentId) {
      return this.handlers.get(this.key(agentId))?.size || 0;
    }
    return this.countAllHandlers();
  }

  hasSubscribers(agentId: AgentId): boolean {
    return (this.handlers.get(this.key(agentId))?.size || 0) > 0;
  }

  private countAllHandlers(): number {
    let count = 0;
    for (const handlers of this.handlers.values()) {
      count += handlers.size;
    }
    return count;
  }
}

export const messageBus = new MessageBusImpl();
