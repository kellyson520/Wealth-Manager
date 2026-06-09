import { getDatabase } from '../database/database';
import { v4 as uuidv4 } from 'uuid';
import { captureError } from '../logger/logger';
import type { AgentId } from '../../shared/types';

export type MemoryLayer = 'working' | 'episodic' | 'long_term' | 'semantic';
export type MemoryType = 'fact' | 'preference' | 'pattern' | 'context' | 'rule';

export interface MemoryEntry {
  id: string;
  layer: MemoryLayer;
  type: MemoryType;
  agentId: AgentId;
  content: string;
  metadata: Record<string, unknown>;
  importance: number;
  accessCount: number;
  lastAccessedAt: string;
  createdAt: string;
  expiresAt?: string;
  tags: string[];
}

export interface MemoryQueryParams {
  layer?: MemoryLayer;
  type?: MemoryType;
  agentId?: AgentId;
  keyword?: string;
  tags?: string[];
  minImportance?: number;
  limit?: number;
}

export interface MemoryStats {
  [layer: string]: {
    count: number;
    oldestEntry: string;
    newestEntry: string;
  };
}

async function ensureMemoryTable(db: Awaited<ReturnType<typeof getDatabase>>): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS memory_engine (
      id TEXT PRIMARY KEY,
      layer TEXT NOT NULL CHECK(layer IN ('working','episodic','long_term','semantic')),
      type TEXT NOT NULL DEFAULT 'fact',
      agent_id TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      importance REAL DEFAULT 0.5,
      access_count INTEGER DEFAULT 0,
      last_accessed_at TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      tags TEXT DEFAULT '[]'
    );
  `);
}

export async function storeMemory(params: {
  layer: MemoryLayer;
  type: MemoryType;
  agentId: AgentId;
  content: string;
  metadata?: Record<string, unknown>;
  importance?: number;
  expiresAt?: string;
  tags?: string[];
}): Promise<MemoryEntry | null> {
  try {
    const db = await getDatabase();
    await ensureMemoryTable(db);

    if (!params.content || params.content.length > 5000) return null;

    const id = uuidv4();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO memory_engine (id, layer, type, agent_id, content, metadata, importance, last_accessed_at, created_at, expires_at, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, params.layer, params.type, params.agentId, params.content,
        JSON.stringify(params.metadata || {}), params.importance || 0.5,
        now, now, params.expiresAt || null,
        JSON.stringify(params.tags || []),
      ]
    );

    return {
      id, layer: params.layer, type: params.type, agentId: params.agentId,
      content: params.content, metadata: params.metadata || {},
      importance: params.importance || 0.5, accessCount: 0,
      lastAccessedAt: now, createdAt: now,
      expiresAt: params.expiresAt, tags: params.tags || [],
    };
  } catch (e) {
    captureError('MemoryEngine.storeMemory', e, 'Failed to store memory');
    return null;
  }
}

export async function recallMemory(params: MemoryQueryParams): Promise<MemoryEntry[]> {
  try {
    const db = await getDatabase();
    await ensureMemoryTable(db);

    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (params.layer) { conditions.push('layer = ?'); values.push(params.layer); }
    if (params.type) { conditions.push('type = ?'); values.push(params.type); }
    if (params.agentId) { conditions.push('agent_id = ?'); values.push(params.agentId); }
    if (params.keyword) { conditions.push('content LIKE ?'); values.push(`%${params.keyword}%`); }
    if (params.tags && params.tags.length > 0) {
      conditions.push(`(${params.tags.map(() => 'tags LIKE ?').join(' OR ')})`);
      params.tags.forEach((t) => values.push(`%"${t}"%`));
    }
    if (params.minImportance !== undefined) {
      conditions.push('importance >= ?');
      values.push(params.minImportance);
    }

    conditions.push('(expires_at IS NULL OR expires_at > ?)');
    values.push(new Date().toISOString());

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);

    const rows = await db.getAllAsync<{
      id: string; layer: string; type: string; agent_id: string;
      content: string; metadata: string; importance: number;
      access_count: number; last_accessed_at: string; created_at: string;
      expires_at: string | null; tags: string;
    }>(
      `SELECT * FROM memory_engine ${where} ORDER BY importance DESC, access_count DESC, created_at DESC LIMIT ?`,
      [...values, limit]
    );

    const now = new Date().toISOString();

    return rows.map((row) => {
      db.runAsync(
        'UPDATE memory_engine SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?',
        [now, row.id]
      ).catch(() => {});

      return {
        id: row.id,
        layer: row.layer as MemoryLayer,
        type: row.type as MemoryType,
        agentId: row.agent_id as AgentId,
        content: row.content,
        metadata: safeParse(row.metadata),
        importance: row.importance,
        accessCount: row.access_count,
        lastAccessedAt: row.last_accessed_at,
        createdAt: row.created_at,
        expiresAt: row.expires_at || undefined,
        tags: safeParse(row.tags),
      };
    });
  } catch (e) {
    captureError('MemoryEngine.recallMemory', e, 'Failed to recall memory');
    return [];
  }
}

export async function forgetMemory(id: string): Promise<boolean> {
  try {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM memory_engine WHERE id = ?', [id]);
    return true;
  } catch (e) {
    captureError('MemoryEngine.forgetMemory', e, 'Failed to forget memory');
    return false;
  }
}

export async function consolidateMemory(
  agentId: AgentId,
  threshold: number = 10
): Promise<{ movedToLongTerm: number; removedFromWorking: number }> {
  try {
    const db = await getDatabase();
    await ensureMemoryTable(db);

    const workingMemories = await db.getAllAsync<{ id: string; content: string; access_count: number; importance: number }>(
      "SELECT id, content, access_count, importance FROM memory_engine WHERE layer = 'working' AND agent_id = ?",
      [agentId]
    );

    let movedToLongTerm = 0;
    let removedFromWorking = 0;

    for (const mem of workingMemories) {
      if (mem.access_count >= threshold && mem.importance >= 0.4) {
        await db.runAsync(
          "UPDATE memory_engine SET layer = 'long_term', importance = MIN(1.0, importance + 0.1) WHERE id = ?",
          [mem.id]
        );
        movedToLongTerm++;
      } else if (mem.access_count < 2 && mem.importance < 0.3) {
        await db.runAsync('DELETE FROM memory_engine WHERE id = ?', [mem.id]);
        removedFromWorking++;
      }
    }

    return { movedToLongTerm, removedFromWorking };
  } catch (e) {
    captureError('MemoryEngine.consolidateMemory', e, 'Failed to consolidate memory');
    return { movedToLongTerm: 0, removedFromWorking: 0 };
  }
}

export async function getMemoryStats(): Promise<MemoryStats> {
  try {
    const db = await getDatabase();
    await ensureMemoryTable(db);

    const rows = await db.getAllAsync<{
      layer: string; count: number; oldest: string; newest: string;
    }>(
      `SELECT layer, COUNT(*) as count, MIN(created_at) as oldest, MAX(created_at) as newest
       FROM memory_engine GROUP BY layer`
    );

    const stats: MemoryStats = {};
    for (const row of rows) {
      stats[row.layer] = {
        count: row.count,
        oldestEntry: row.oldest,
        newestEntry: row.newest,
      };
    }

    const layers: MemoryLayer[] = ['working', 'episodic', 'long_term', 'semantic'];
    for (const layer of layers) {
      if (!stats[layer]) {
        stats[layer] = { count: 0, oldestEntry: '', newestEntry: '' };
      }
    }

    return stats;
  } catch (e) {
    captureError('MemoryEngine.getMemoryStats', e, 'Failed to get memory stats');
    return { working: { count: 0, oldestEntry: '', newestEntry: '' }, episodic: { count: 0, oldestEntry: '', newestEntry: '' }, long_term: { count: 0, oldestEntry: '', newestEntry: '' }, semantic: { count: 0, oldestEntry: '', newestEntry: '' } };
  }
}

/**
 * Get total memory entry count for an agent across all layers.
 */
export async function getTotalMemoryCount(agentId: AgentId): Promise<number> {
  try {
    const db = await getDatabase();
    await ensureMemoryTable(db);
    const row = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM memory_engine WHERE agent_id = ?',
      [agentId]
    );
    return row?.cnt ?? 0;
  } catch (e) {
    captureError('MemoryEngine.getTotalMemoryCount', e, 'Failed to count memories');
    return 0;
  }
}

/**
 * Get total content size in bytes for an agent's memories.
 */
export async function getTotalMemorySize(agentId: AgentId): Promise<number> {
  try {
    const db = await getDatabase();
    await ensureMemoryTable(db);
    const row = await db.getFirstAsync<{ total: number }>(
      'SELECT COALESCE(SUM(LENGTH(content)), 0) as total FROM memory_engine WHERE agent_id = ?',
      [agentId]
    );
    return row?.total ?? 0;
  } catch (e) {
    captureError('MemoryEngine.getTotalMemorySize', e, 'Failed to measure memory size');
    return 0;
  }
}

/**
 * Evict oldest/least-important entries (LRU) to bring count under the limit.
 * Returns number of entries removed.
 */
export async function evictLRU(
  agentId: AgentId,
  targetCount: number
): Promise<number> {
  try {
    const db = await getDatabase();
    await ensureMemoryTable(db);

    const row = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM memory_engine WHERE agent_id = ?',
      [agentId]
    );
    const current = row?.cnt ?? 0;
    if (current <= targetCount) return 0;

    const excess = current - targetCount;
    const result = await db.runAsync(
      `DELETE FROM memory_engine WHERE id IN (
        SELECT id FROM memory_engine
        WHERE agent_id = ?
        ORDER BY importance ASC, access_count ASC, last_accessed_at ASC
        LIMIT ?
      )`,
      [agentId, excess]
    );
    return result?.changes ?? 0;
  } catch (e) {
    captureError('MemoryEngine.evictLRU', e, 'Failed to evict LRU entries');
    return 0;
  }
}

function safeParse(str: string): any {
  try { return JSON.parse(str); } catch { return str; }
}
