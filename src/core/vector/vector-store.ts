import { getDatabase } from '../database/database';
import { v4 as uuidv4 } from 'uuid';
import { captureError } from '../logger/logger';

export interface VectorEntry {
  id: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  sourceType: string;
  sourceId: string;
  createdAt: string;
}

async function ensureVectorTable(db: Awaited<ReturnType<typeof getDatabase>>): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS vector_store (
      id TEXT PRIMARY KEY,
      embedding TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      source_type TEXT DEFAULT 'memory',
      source_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_vector_source ON vector_store(source_type, source_id)`);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function simpleEmbed(text: string, dim: number = 128): number[] {
  const chars = text.split('');
  const embedding: number[] = new Array(dim).fill(0);

  const seed = (s: string): number => {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      const char = s.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  };

  for (let i = 0; i < dim; i++) {
    const trigram = i < chars.length - 2
      ? chars[i] + chars[i + 1] + chars[i + 2]
      : text + String(i);
    const raw = seed(trigram) / 2147483647;
    embedding[i] = Math.round((raw - 0.5) * 200) / 100;
  }

  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      embedding[i] /= norm;
    }
  }

  return embedding;
}

export async function storeVector(params: {
  text: string;
  sourceType: string;
  sourceId: string;
  metadata?: Record<string, unknown>;
  dim?: number;
}): Promise<VectorEntry | null> {
  try {
    const db = await getDatabase();
    await ensureVectorTable(db);

    const embedding = simpleEmbed(params.text, params.dim || 128);
    const id = uuidv4();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO vector_store (id, embedding, metadata, source_type, source_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, JSON.stringify(embedding), JSON.stringify(params.metadata || {}), params.sourceType, params.sourceId, now]
    );

    return { id, embedding, metadata: params.metadata || {}, sourceType: params.sourceType, sourceId: params.sourceId, createdAt: now };
  } catch (e) {
    captureError('VectorStore.storeVector', e, 'Failed to store vector');
    return null;
  }
}

export async function searchSimilar(params: {
  query: string;
  sourceType?: string;
  limit?: number;
  minSimilarity?: number;
  dim?: number;
}): Promise<{ entry: VectorEntry; similarity: number }[]> {
  try {
    const db = await getDatabase();
    await ensureVectorTable(db);

    const queryEmbedding = simpleEmbed(params.query, params.dim || 128);
    const minSim = params.minSimilarity || 0.3;
    const requestedLimit = Number.isFinite(params.limit) ? Math.floor(params.limit as number) : 10;
    const limit = Math.min(Math.max(requestedLimit, 1), 50);

    let where = '1=1';
    const values: string[] = [];
    if (params.sourceType) { where += ' AND source_type = ?'; values.push(params.sourceType); }

    const rows = await db.getAllAsync<{
      id: string; embedding: string; metadata: string;
      source_type: string; source_id: string; created_at: string;
    }>(
      `SELECT * FROM vector_store WHERE ${where} ORDER BY created_at DESC LIMIT ?`,
      [...values, 500]
    );

    const results: { entry: VectorEntry; similarity: number }[] = [];

    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.embedding);
        if (!Array.isArray(parsed) || !parsed.every((v: unknown) => typeof v === 'number')) continue;
        const stored = parsed as number[];
        const similarity = cosineSimilarity(queryEmbedding, stored);

        if (similarity >= minSim) {
          results.push({
            entry: {
              id: row.id,
              embedding: stored,
              metadata: safeParse(row.metadata),
              sourceType: row.source_type,
              sourceId: row.source_id,
              createdAt: row.created_at,
            },
            similarity,
          });
        }
      } catch (e) { captureError('VectorStore.searchSimilar', e as Error, 'Skipping malformed search result row'); }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  } catch (e) {
    captureError('VectorStore.searchSimilar', e, 'Failed to search vectors');
    return [];
  }
}

export async function deleteVector(sourceId: string): Promise<boolean> {
  try {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM vector_store WHERE source_id = ?', [sourceId]);
    return true;
  } catch (e) {
    captureError('VectorStore.deleteVector', e, 'Failed to delete vector');
    return false;
  }
}

export async function getVectorStats(): Promise<{ totalVectors: number; byType: Record<string, number> }> {
  try {
    const db = await getDatabase();
    await ensureVectorTable(db);

    const total = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM vector_store'
    );

    const byTypeRows = await db.getAllAsync<{ source_type: string; count: number }>(
      'SELECT source_type, COUNT(*) as count FROM vector_store GROUP BY source_type'
    );

    const byType: Record<string, number> = {};
    for (const r of byTypeRows) {
      byType[r.source_type] = r.count;
    }

    return { totalVectors: total?.count || 0, byType };
  } catch (e) {
    captureError('VectorStore.getVectorStats', e, 'Failed to get vector stats');
    return { totalVectors: 0, byType: {} };
  }
}

function safeParse(str: string): Record<string, unknown> {
  try { return JSON.parse(str); } catch { return {}; }
}
