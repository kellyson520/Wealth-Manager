import { messageBus } from '../../../core/message-bus/message-bus';
import {
  moveToDeadLetter,
  listDeadLetters,
  purgeDeadLetters,
} from '../../../core/message-bus/dead-letter';
import type { BusMessage } from '../../../core/message-bus/message-bus';
import type { AgentId } from '../../../shared/types';

describe('MessageBus', () => {
  beforeEach(() => {
    messageBus.reset();
  });

  it('should deliver message to subscribed agent', async () => {
    const received: BusMessage[] = [];
    messageBus.subscribe('ledger' as AgentId, async (msg) => {
      received.push(msg);
    });

    await messageBus.publish({
      from: 'master' as AgentId,
      to: 'ledger' as AgentId,
      type: 'event',
      payload: { test: true },
    });

    expect(received).toHaveLength(1);
    expect(received[0].from).toBe('master');
    expect(received[0].to).toBe('ledger');
    expect(received[0].payload).toEqual({ test: true });
  });

  it('should deliver broadcast to all subscribers except sender', async () => {
    const receivedA: BusMessage[] = [];
    const receivedB: BusMessage[] = [];

    messageBus.subscribe('analyst' as AgentId, async (msg) => { receivedA.push(msg); });
    messageBus.subscribe('coach' as AgentId, async (msg) => { receivedB.push(msg); });

    await messageBus.publish({
      from: 'master' as AgentId,
      to: 'broadcast',
      type: 'event',
      payload: { broadcast: true },
    });

    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(1);
  });

  it('should unsubscribe correctly', async () => {
    const received: BusMessage[] = [];
    const handler = async (msg: BusMessage) => { received.push(msg); };
    const unsub = messageBus.subscribe('ledger' as AgentId, handler);
    unsub();

    await messageBus.publish({
      from: 'master' as AgentId,
      to: 'ledger' as AgentId,
      type: 'event',
      payload: {},
    });

    expect(received).toHaveLength(0);
  });

  it('should handle handler errors gracefully and move to dead letter', async () => {
    messageBus.subscribe('ledger' as AgentId, async () => {
      throw new Error('Handler failed');
    });

    await messageBus.publish({
      from: 'master' as AgentId,
      to: 'ledger' as AgentId,
      type: 'event',
      payload: { test: true },
    });

    const stats = messageBus.getStats();
    expect(stats.totalDeadLettered).toBeGreaterThanOrEqual(1);
    expect(stats.totalDelivered).toBe(0);
  });

  it('should track stats', async () => {
    messageBus.subscribe('guardian' as AgentId, async () => {});

    await messageBus.publish({
      from: 'master' as AgentId,
      to: 'guardian' as AgentId,
      type: 'event',
      payload: {},
    });

    const stats = messageBus.getStats();
    expect(stats.totalPublished).toBe(1);
    expect(stats.totalDelivered).toBe(1);
    expect(stats.activeSubscriptions).toBe(1);
  });

  it('should count subscribers', () => {
    expect(messageBus.getSubscriberCount()).toBe(0);

    messageBus.subscribe('ledger' as AgentId, async () => {});
    expect(messageBus.getSubscriberCount()).toBe(1);

    messageBus.subscribe('analyst' as AgentId, async () => {});
    expect(messageBus.getSubscriberCount('ledger' as AgentId)).toBe(1);
    expect(messageBus.getSubscriberCount('analyst' as AgentId)).toBe(1);
    expect(messageBus.getSubscriberCount()).toBe(2);
  });
});

describe('DeadLetter', () => {
  it('should list dead letters', async () => {
    const result = await listDeadLetters({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it('should purge old dead letters without error', async () => {
    const count = await purgeDeadLetters({ olderThanDays: 7 });
    expect(typeof count).toBe('number');
  });
});
