import { getDatabase } from '../../database/database';
import { storeVector, searchSimilar } from '../../vector/vector-store';
import { captureError } from '../../logger/logger';
import type { AgentId } from '../../../shared/types';

export interface IndexEntry {
  id: string;
  sourceId: string;
  sourceType: string;
  score: number;
  embedding: number[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface ScoringWeights {
  importance: number;
  recency: number;
  frequency: number;
  similarity: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  importance: 0.25,
  recency: 0.20,
  frequency: 0.15,
  similarity: 0.40,
};

const RECENCY_HALF_LIFE_DAYS = 30;
const FREQUENCY_BASELINE = 10;

export async function indexMemory(params: {
  content: string;
  sourceId: string;
  sourceType: string;
  agentId: AgentId;
  importance?: number;
  metadata?: Record<string, unknown>;
  dim?: number;
}): Promise<IndexEntry | null> {
  try {
    const dim = params.dim || 128;
    const vecEntry = await storeVector({
      text: params.content,
      sourceType: `index_${params.sourceType}`,
      sourceId: params.sourceId,
      metadata: {
        importance: params.importance || 0.5,
        agentId: params.agentId,
        indexedAt: new Date().toISOString(),
        ...params.metadata,
      },
      dim,
    });

    if (!vecEntry) return null;

    return {
      id: vecEntry.id,
      sourceId: params.sourceId,
      sourceType: params.sourceType,
      score: params.importance || 0.5,
      embedding: vecEntry.embedding,
      metadata: vecEntry.metadata,
      createdAt: vecEntry.createdAt,
    };
  } catch (e) {
    captureError('MemoryIndex.indexMemory', e, 'Failed to index memory');
    return null;
  }
}

export async function searchIndex(params: {
  query: string;
  sourceType?: string;
  topK?: number;
  minScore?: number;
  dim?: number;
  weights?: Partial<ScoringWeights>;
}): Promise<IndexEntry[]> {
  try {
    const dim = params.dim || 128;
    const w = { ...DEFAULT_WEIGHTS, ...params.weights };

    const results = await searchSimilar({
      query: params.query,
      sourceType: params.sourceType ? `index_${params.sourceType}` : undefined,
      limit: (params.topK || 5) * 3,
      minSimilarity: 0.1,
      dim,
    });

    const now = Date.now();
    const entries: IndexEntry[] = [];

    for (const r of results) {
      const meta = r.entry.metadata;
      const importance = (meta.importance as number) || 0.5;
      const createdAt = r.entry.createdAt;
      const ageDays = createdAt
        ? (now - new Date(createdAt).getTime()) / 86400000
        : 0;

      const recencyScore = Math.exp(-Math.log(2) * ageDays / RECENCY_HALF_LIFE_DAYS);

      const accessCount = (meta.accessCount as number) || 0;
      const frequencyScore = Math.min(1.0, accessCount / FREQUENCY_BASELINE);

      const finalScore =
        w.similarity * r.similarity +
        w.importance * importance +
        w.recency * recencyScore +
        w.frequency * frequencyScore;

      if (finalScore >= (params.minScore || 0.15)) {
        entries.push({
          id: r.entry.id,
          sourceId: r.entry.sourceId,
          sourceType: r.entry.sourceType.replace('index_', ''),
          score: Math.round(finalScore * 1000) / 1000,
          embedding: r.entry.embedding,
          metadata: meta,
          createdAt: r.entry.createdAt,
        });
      }
    }

    entries.sort((a, b) => b.score - a.score);
    return entries.slice(0, params.topK || 5);
  } catch (e) {
    captureError('MemoryIndex.searchIndex', e, 'Failed to search index');
    return [];
  }
}

export async function batchIndex(memories: {
  id: string;
  content: string;
  sourceType: string;
  agentId: AgentId;
  importance?: number;
  metadata?: Record<string, unknown>;
}[]): Promise<{ indexed: number; failed: number }> {
  let indexed = 0;
  let failed = 0;

  for (const mem of memories) {
    const result = await indexMemory({
      content: mem.content,
      sourceId: mem.id,
      sourceType: mem.sourceType,
      agentId: mem.agentId,
      importance: mem.importance,
      metadata: mem.metadata,
    });

    if (result) {
      indexed++;
    } else {
      failed++;
    }
  }

  return { indexed, failed };
}

export async function getIndexStats(): Promise<{
  totalEntries: number;
  byType: Record<string, number>;
  avgScore: number;
}> {
  try {
    const db = await getDatabase();

    const totalRow = await db.getFirstAsync<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM vector_store WHERE source_type LIKE 'index_%'"
    );

    const typeRows = await db.getAllAsync<{ source_type: string; count: number }>(
      "SELECT source_type, COUNT(*) as count FROM vector_store WHERE source_type LIKE 'index_%' GROUP BY source_type"
    );

    const byType: Record<string, number> = {};
    for (const r of typeRows) {
      byType[r.source_type.replace('index_', '')] = r.count;
    }

    return {
      totalEntries: totalRow?.cnt || 0,
      byType,
      avgScore: 0,
    };
  } catch (e) {
    captureError('MemoryIndex.getIndexStats', e, 'Failed to get index stats');
    return { totalEntries: 0, byType: {}, avgScore: 0 };
  }
}
