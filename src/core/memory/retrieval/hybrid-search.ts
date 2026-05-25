import { getDatabase } from '../../database/database';
import { generateEmbedding } from '../embedding/embedding-service';
import { simpleEmbed, cosineSimilarity } from '../../vector/vector-store';
import { captureError } from '../../logger/logger';

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
  sourceType: string;
}

const RRF_K = 60;

export interface HybridSearchOptions {
  vectorWeight?: number;
  bm25Weight?: number;
  topK?: number;
  sourceType?: string;
  minScore?: number;
  dim?: number;
  useCloudEmbedding?: boolean;
}

export async function hybridSearch(
  query: string,
  options: HybridSearchOptions = {}
): Promise<SearchResult[]> {
  const {
    vectorWeight = 0.6,
    bm25Weight = 0.4,
    topK = 5,
    sourceType,
    minScore = 0.1,
    dim = 128,
    useCloudEmbedding = false,
  } = options;

  try {
    const [vectorResults, bm25Results] = await Promise.all([
      vectorSearchInternal(query, topK * 2, sourceType, minScore, dim, useCloudEmbedding),
      bm25Search(query, topK * 2, sourceType),
    ]);

    if (vectorResults.length === 0 && bm25Results.length === 0) {
      return [];
    }

    const fused = new Map<string, { result: SearchResult; fusedScore: number }>();

    vectorResults.forEach((r, idx) => {
      const score = (1 / (RRF_K + idx + 1)) * vectorWeight;
      fused.set(r.id, { result: r, fusedScore: score });
    });

    bm25Results.forEach((r, idx) => {
      const score = (1 / (RRF_K + idx + 1)) * bm25Weight;
      const existing = fused.get(r.id);
      if (existing) {
        existing.fusedScore += score;
        if (r.score > existing.result.score) {
          existing.result = r;
        }
      } else {
        fused.set(r.id, { result: r, fusedScore: score });
      }
    });

    return Array.from(fused.values())
      .sort((a, b) => b.fusedScore - a.fusedScore)
      .slice(0, topK)
      .map((f) => f.result);
  } catch (e) {
    captureError('HybridSearch.hybridSearch', e, 'Hybrid search failed');
    return [];
  }
}

async function vectorSearchInternal(
  query: string,
  topK: number,
  sourceType?: string,
  minScore: number = 0.1,
  dim: number = 128,
  useCloudEmbedding: boolean = false
): Promise<SearchResult[]> {
  try {
    const db = await getDatabase();
    const queryEmbedding = useCloudEmbedding
      ? await generateEmbedding(query, dim)
      : simpleEmbed(query, dim);

    let where = '1=1';
    const params: string[] = [];
    if (sourceType) {
      where += ' AND source_type = ?';
      params.push(sourceType);
    }

    const rows = await db.getAllAsync<{
      id: string; embedding: string; metadata: string;
      source_type: string; source_id: string;
    }>(
      `SELECT * FROM vector_store WHERE ${where} ORDER BY created_at DESC LIMIT 500`,
      params
    );

    const results: { result: SearchResult; similarity: number }[] = [];

    for (const row of rows) {
      try {
        const stored = JSON.parse(row.embedding) as number[];
        const similarity = cosineSimilarity(queryEmbedding, stored);

        if (similarity >= minScore) {
          results.push({
            result: {
              id: row.id,
              content: row.source_id,
              score: similarity,
              metadata: safeParse(row.metadata),
              sourceType: row.source_type,
            },
            similarity,
          });
        }
      } catch {
        /* skip malformed */
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK).map((r) => r.result);
  } catch (e) {
    captureError('HybridSearch.vectorSearch', e, 'Vector search failed');
    return [];
  }
}

async function bm25Search(
  query: string,
  topK: number,
  sourceType?: string
): Promise<SearchResult[]> {
  try {
    const db = await getDatabase();

    const keywords = query
      .toLowerCase()
      .replace(/[\\[\]{}()*+?.^$|]/g, ' ')
      .split(/\s+/)
      .filter((k) => k.length >= 1);

    if (keywords.length === 0) return [];

    const allMemories = await db.getAllAsync<{
      id: string; content: string; metadata: string;
      source_type: string; source_id: string;
    }>(
      sourceType
        ? `SELECT m.id, m.content, m.metadata, 'memory_engine' as source_type, m.content as source_id
           FROM memory_engine m
           WHERE (m.expires_at IS NULL OR m.expires_at > datetime('now'))
           ORDER BY m.created_at DESC LIMIT 500`
        : `SELECT m.id, m.content, m.metadata, 'memory_engine' as source_type, m.content as source_id
           FROM memory_engine m
           WHERE (m.expires_at IS NULL OR m.expires_at > datetime('now'))
           ORDER BY m.created_at DESC LIMIT 500`
    );

    const totalDocs = allMemories.length || 1;
    const avgDL = allMemories.reduce((s, r) => s + r.content.length, 0) / totalDocs || 1;
    const k1 = 1.2;
    const b = 0.75;

    const scored: { result: SearchResult; bm25: number }[] = [];

    for (const mem of allMemories) {
      const text = mem.content.toLowerCase();
      const docLen = text.length;
      const docLenNorm = 1 - b + b * (docLen / avgDL);
      let score = 0;

      for (const keyword of keywords) {
        const termFreq = (text.match(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
        if (termFreq === 0) continue;

        const docFreq = allMemories.filter((m) =>
          m.content.toLowerCase().includes(keyword)
        ).length;
        const idf = Math.log(1 + (totalDocs - docFreq + 0.5) / (docFreq + 0.5));
        const tfNorm = (termFreq * (k1 + 1)) / (termFreq + k1 * docLenNorm);
        score += idf * tfNorm;
      }

      if (score > 0) {
        scored.push({
          result: {
            id: mem.id,
            content: mem.content,
            score,
            metadata: safeParse(mem.metadata),
            sourceType: mem.source_type === 'memory_engine' ? 'memory' : mem.source_type,
          },
          bm25: score,
        });
      }
    }

    scored.sort((a, b) => b.bm25 - a.bm25);
    return scored.slice(0, topK).map((s) => s.result);
  } catch (e) {
    captureError('HybridSearch.bm25Search', e, 'BM25 search failed');
    return [];
  }
}

function safeParse(str: string): Record<string, unknown> {
  try { return JSON.parse(str); } catch { return {}; }
}
