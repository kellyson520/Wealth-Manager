import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/database';
import type { AgentId } from '../../shared/types';
import type { BusMessage } from './message-bus';
import { captureError } from '../logger/logger';

export interface DeadLetterRecord {
  id: string;
  messageId: string;
  from: string;
  to: string;
  type: string;
  payload: string;
  correlationId: string | null;
  error: string;
  createdAt: string;
  retryCount: number;
  lastRetryAt: string | null;
}

async function ensureDeadLetterTable(
  db: Awaited<ReturnType<typeof getDatabase>>
): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS dead_letter_queue (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      correlation_id TEXT,
      error TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      last_retry_at TEXT
    );
  `);
  await db.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_dlq_retry ON dead_letter_queue(retry_count, created_at)'
  );
}

export async function moveToDeadLetter(
  msg: BusMessage,
  target: AgentId,
  error: string
): Promise<DeadLetterRecord | null> {
  try {
    const db = await getDatabase();
    await ensureDeadLetterTable(db);

    const id = uuidv4();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO dead_letter_queue (id, message_id, from_agent, to_agent, type, payload, correlation_id, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, msg.id, msg.from, target, msg.type,
        JSON.stringify(msg.payload), msg.correlationId || null,
        error, now,
      ]
    );

    return {
      id, messageId: msg.id, from: msg.from, to: target,
      type: msg.type, payload: JSON.stringify(msg.payload),
      correlationId: msg.correlationId || null,
      error, createdAt: now, retryCount: 0, lastRetryAt: null,
    };
  } catch (e) {
    captureError('DeadLetter.moveToDeadLetter', e, 'Failed to store dead letter');
    return null;
  }
}

export async function listDeadLetters(params?: {
  limit?: number;
}): Promise<DeadLetterRecord[]> {
  try {
    const db = await getDatabase();
    await ensureDeadLetterTable(db);

    const limit = Math.min(params?.limit || 50, 200);
    const rows = await db.getAllAsync<{
      id: string; message_id: string; from_agent: string; to_agent: string;
      type: string; payload: string; correlation_id: string | null;
      error: string; created_at: string; retry_count: number; last_retry_at: string | null;
    }>(
      `SELECT * FROM dead_letter_queue ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );

    return rows.map((r) => ({
      id: r.id,
      messageId: r.message_id,
      from: r.from_agent,
      to: r.to_agent,
      type: r.type,
      payload: r.payload,
      correlationId: r.correlation_id,
      error: r.error,
      createdAt: r.created_at,
      retryCount: r.retry_count,
      lastRetryAt: r.last_retry_at,
    }));
  } catch (e) {
    captureError('DeadLetter.listDeadLetters', e, 'Failed to list dead letters');
    return [];
  }
}

export async function retryDeadLetters(params?: {
  limit?: number;
}): Promise<{ attempted: number; succeeded: number }> {
  try {
    const db = await getDatabase();
    await ensureDeadLetterTable(db);

    const limit = Math.min(params?.limit || 10, 50);
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM dead_letter_queue WHERE retry_count < 3 ORDER BY retry_count ASC, created_at ASC LIMIT ?`,
      [limit]
    );

    let attempted = 0;
    let succeeded = 0;

    for (const row of rows) {
      attempted++;
      const now = new Date().toISOString();

      try {
        await db.runAsync(
          `UPDATE dead_letter_queue SET retry_count = retry_count + 1, last_retry_at = ? WHERE id = ?`,
          [now, row.id]
        );
        succeeded++;
      } catch {
        await db.runAsync(
          `UPDATE dead_letter_queue SET retry_count = retry_count + 1, last_retry_at = ?, error = error || '(retry failed)' WHERE id = ?`,
          [now, row.id]
        );
      }
    }

    return { attempted, succeeded };
  } catch (e) {
    captureError('DeadLetter.retryDeadLetters', e, 'Failed to retry dead letters');
    return { attempted: 0, succeeded: 0 };
  }
}

export async function purgeDeadLetters(params?: {
  olderThanDays?: number;
}): Promise<number> {
  try {
    const db = await getDatabase();
    await ensureDeadLetterTable(db);

    const days = params?.olderThanDays || 7;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const result = await db.runAsync(
      `DELETE FROM dead_letter_queue WHERE created_at < ? AND retry_count >= 3`,
      [cutoff]
    );

    return result.changes || 0;
  } catch (e) {
    captureError('DeadLetter.purgeDeadLetters', e, 'Failed to purge dead letters');
    return 0;
  }
}
