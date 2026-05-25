import { getDatabase } from '../../database/database';
import { storeMemory, recallMemory, MemoryType } from '../memory-engine';
import { storeVector } from '../../vector/vector-store';
import { captureError } from '../../logger/logger';
import type { AgentId } from '../../../shared/types';

export interface LongtermEntry {
  id: string;
  content: string;
  type: MemoryType;
  importance: number;
  accessCount: number;
  lastAccessedAt: string;
  createdAt: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

interface EntityExtraction {
  entity: string;
  type: 'person' | 'place' | 'category' | 'amount' | 'date' | 'keyword';
  confidence: number;
}

export async function storeLongterm(params: {
  content: string;
  type: MemoryType;
  agentId: AgentId;
  importance?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  ttlDays?: number;
}): Promise<LongtermEntry | null> {
  try {
    const importance = params.importance || 0.5;
    let expiresAt: string | undefined;

    if (params.ttlDays && params.ttlDays > 0) {
      const expiry = new Date(Date.now() + params.ttlDays * 86400000);
      expiresAt = expiry.toISOString();
    }

    const entities = extractEntities(params.content);
    const enrichedMetadata = {
      ...params.metadata,
      entities: entities.map((e) => ({ entity: e.entity, type: e.type })),
      sourceLength: params.content.length,
    };

    const entry = await storeMemory({
      layer: 'long_term',
      type: params.type,
      agentId: params.agentId,
      content: params.content,
      importance,
      tags: params.tags || [],
      metadata: enrichedMetadata,
      expiresAt,
    });

    if (!entry) return null;

    try {
      await storeVector({
        text: params.content,
        sourceType: 'longterm',
        sourceId: entry.id,
        metadata: enrichedMetadata,
        dim: 128,
      });
    } catch {
      /* vector indexing best-effort */
    }

    return {
      id: entry.id,
      content: entry.content,
      type: entry.type,
      importance: entry.importance,
      accessCount: entry.accessCount,
      lastAccessedAt: entry.lastAccessedAt,
      createdAt: entry.createdAt,
      tags: entry.tags,
      metadata: entry.metadata,
    };
  } catch (e) {
    captureError('LongtermBase.storeLongterm', e, 'Failed to store longterm entry');
    return null;
  }
}

export async function queryLongterm(params: {
  agentId: AgentId;
  type?: MemoryType;
  keyword?: string;
  tags?: string[];
  minImportance?: number;
  limit?: number;
  offset?: number;
}): Promise<LongtermEntry[]> {
  try {
    const memories = await recallMemory({
      layer: 'long_term',
      agentId: params.agentId,
      type: params.type,
      keyword: params.keyword,
      tags: params.tags,
      minImportance: params.minImportance,
      limit: params.limit || 20,
    });

    return memories.map((m) => ({
      id: m.id,
      content: m.content,
      type: m.type,
      importance: m.importance,
      accessCount: m.accessCount,
      lastAccessedAt: m.lastAccessedAt,
      createdAt: m.createdAt,
      tags: m.tags,
      metadata: m.metadata,
    }));
  } catch (e) {
    captureError('LongtermBase.queryLongterm', e, 'Failed to query longterm');
    return [];
  }
}

export async function searchByEntity(params: {
  agentId: AgentId;
  entity: string;
  limit?: number;
}): Promise<LongtermEntry[]> {
  try {
    const db = await getDatabase();
    const entityPattern = `%"entity":"${params.entity}"%`;

    const rows = await db.getAllAsync<{
      id: string; content: string; type: string; importance: number;
      access_count: number; last_accessed_at: string; created_at: string;
      tags: string; metadata: string;
    }>(
      `SELECT * FROM memory_engine WHERE layer = 'long_term' AND agent_id = ? AND metadata LIKE ? ORDER BY importance DESC LIMIT ?`,
      [params.agentId, entityPattern, params.limit || 10]
    );

    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      type: r.type as MemoryType,
      importance: r.importance,
      accessCount: r.access_count,
      lastAccessedAt: r.last_accessed_at,
      createdAt: r.created_at,
      tags: safeParseArray(r.tags),
      metadata: safeParseObject(r.metadata),
    }));
  } catch (e) {
    captureError('LongtermBase.searchByEntity', e, 'Failed to search by entity');
    return [];
  }
}

export async function updateImportance(
  id: string,
  delta: number
): Promise<boolean> {
  try {
    const db = await getDatabase();
    await db.runAsync(
      'UPDATE memory_engine SET importance = MIN(1.0, MAX(0.0, importance + ?)) WHERE id = ?',
      [delta, id]
    );
    return true;
  } catch (e) {
    captureError('LongtermBase.updateImportance', e, 'Failed to update importance');
    return false;
  }
}

export async function ageOutStale(
  agentId: AgentId,
  maxAgeDays: number = 90,
  minImportance: number = 0.3
): Promise<number> {
  try {
    const db = await getDatabase();
    const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();

    const result = await db.runAsync(
      `DELETE FROM memory_engine
       WHERE layer = 'long_term'
         AND agent_id = ?
         AND created_at < ?
         AND importance < ?
         AND access_count < 3`,
      [agentId, cutoff, minImportance]
    );

    return result?.changes || 0;
  } catch (e) {
    captureError('LongtermBase.ageOutStale', e, 'Failed to age out stale entries');
    return 0;
  }
}

export async function compactLongterm(
  agentId: AgentId,
  maxEntries: number = 1000
): Promise<{ removed: number }> {
  try {
    const db = await getDatabase();

    const countRow = await db.getFirstAsync<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM memory_engine WHERE layer = 'long_term' AND agent_id = ?",
      [agentId]
    );

    if (!countRow || countRow.cnt <= maxEntries) {
      return { removed: 0 };
    }

    const excess = countRow.cnt - maxEntries;

    const result = await db.runAsync(
      `DELETE FROM memory_engine
       WHERE id IN (
         SELECT id FROM memory_engine
         WHERE layer = 'long_term' AND agent_id = ?
         ORDER BY importance ASC, access_count ASC, created_at ASC
         LIMIT ?
       )`,
      [agentId, excess]
    );

    return { removed: result?.changes || 0 };
  } catch (e) {
    captureError('LongtermBase.compactLongterm', e, 'Failed to compact longterm');
    return { removed: 0 };
  }
}

export async function getLongtermStats(agentId: AgentId): Promise<{
  total: number;
  byType: Record<string, number>;
  avgImportance: number;
  oldestEntry: string;
  newestEntry: string;
}> {
  try {
    const db = await getDatabase();

    const totalRow = await db.getFirstAsync<{ cnt: number; avg_imp: number; oldest: string; newest: string }>(
      "SELECT COUNT(*) as cnt, AVG(importance) as avg_imp, MIN(created_at) as oldest, MAX(created_at) as newest FROM memory_engine WHERE layer = 'long_term' AND agent_id = ?",
      [agentId]
    );

    const typeRows = await db.getAllAsync<{ type: string; count: number }>(
      "SELECT type, COUNT(*) as count FROM memory_engine WHERE layer = 'long_term' AND agent_id = ? GROUP BY type",
      [agentId]
    );

    const byType: Record<string, number> = {};
    for (const r of typeRows) {
      byType[r.type] = r.count;
    }

    return {
      total: totalRow?.cnt || 0,
      byType,
      avgImportance: totalRow?.avg_imp || 0,
      oldestEntry: totalRow?.oldest || '',
      newestEntry: totalRow?.newest || '',
    };
  } catch (e) {
    captureError('LongtermBase.getLongtermStats', e, 'Failed to get longterm stats');
    return { total: 0, byType: {}, avgImportance: 0, oldestEntry: '', newestEntry: '' };
  }
}

function extractEntities(text: string): EntityExtraction[] {
  const entities: EntityExtraction[] = [];

  const amountRegex = /¥?\s*(\d+(?:\.\d{1,2})?)\s*(?:元|块|块钱?)/g;
  let match;
  while ((match = amountRegex.exec(text)) !== null) {
    entities.push({
      entity: `¥${match[1]}`,
      type: 'amount',
      confidence: 0.9,
    });
  }

  const dateRegex = /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?)/g;
  while ((match = dateRegex.exec(text)) !== null) {
    entities.push({
      entity: match[1],
      type: 'date',
      confidence: 0.9,
    });
  }

  const categoryWords = ['餐饮', '交通', '购物', '娱乐', '住房', '医疗', '教育', '水电', '投资', '工资', '奖金', '兼职'];
  for (const cat of categoryWords) {
    if (text.includes(cat)) {
      entities.push({
        entity: cat,
        type: 'category',
        confidence: 0.7,
      });
    }
  }

  const keywordRegex = /(?:关于|有关|涉及|提到)(.{2,6})(?:的|了|，|。|！|？|\s|$)/g;
  while ((match = keywordRegex.exec(text)) !== null) {
    if (match[1] && match[1].length >= 2) {
      entities.push({
        entity: match[1],
        type: 'keyword',
        confidence: 0.5,
      });
    }
  }

  return entities;
}

function safeParseObject(str: string): Record<string, unknown> {
  try { return JSON.parse(str); } catch { return {}; }
}

function safeParseArray(str: string): string[] {
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
