import { getDatabase } from '../../database/database';
import { storeVector, searchSimilar, deleteVector } from '../../vector/vector-store';
import { generateEmbedding, normEmbedding } from '../embedding/embedding-service';
import { storeMemory, recallMemory } from '../memory-engine';
import { captureError } from '../../logger/logger';
import type { AgentId } from '../../../shared/types';

export interface SemanticEntry {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  sourceId: string;
  similarity?: number;
  createdAt: string;
}

const CATEGORY_EMBEDDINGS: Record<string, string> = {
  preference: '用户偏好 喜欢 不喜欢 爱好',
  rule: '规则 约束 限制 必须 不允许 禁止',
  fact: '事实 信息 数据 记录 情况',
  summary: '摘要 总结 概括 回顾',
};

export async function storeSemantic(params: {
  content: string;
  agentId: AgentId;
  category?: 'preference' | 'rule' | 'fact' | 'summary';
  metadata?: Record<string, unknown>;
  importance?: number;
  dim?: number;
}): Promise<SemanticEntry | null> {
  try {
    const dim = params.dim || 128;
    const embedding = await generateEmbedding(params.content, dim);
    const normalized = normEmbedding(embedding);

    const memEntry = await storeMemory({
      layer: 'semantic',
      type: (params.category === 'rule' ? 'rule' : params.category === 'preference' ? 'preference' : 'fact') as any,
      agentId: params.agentId,
      content: params.content,
      metadata: params.metadata || {},
      importance: params.importance || 0.5,
      tags: ['semantic', params.category || 'fact'],
    });

    if (!memEntry) return null;

    const vecEntry = await storeVector({
      text: params.content,
      sourceType: 'semantic',
      sourceId: memEntry.id,
      metadata: {
        category: params.category || 'fact',
        importance: params.importance,
        ...params.metadata,
      },
      dim,
    });

    if (!vecEntry) return null;

    return {
      id: memEntry.id,
      content: params.content,
      embedding: normalized,
      metadata: params.metadata || {},
      sourceId: memEntry.id,
      createdAt: memEntry.createdAt,
    };
  } catch (e) {
    captureError('SemanticStore.storeSemantic', e, 'Failed to store semantic entry');
    return null;
  }
}

export async function searchSemantic(params: {
  query: string;
  category?: 'preference' | 'rule' | 'fact' | 'summary';
  agentId?: AgentId;
  topK?: number;
  minSimilarity?: number;
  dim?: number;
}): Promise<SemanticEntry[]> {
  try {
    const dim = params.dim || 128;

    let categoryBiasText = params.query;
    if (params.category && CATEGORY_EMBEDDINGS[params.category]) {
      categoryBiasText = `${CATEGORY_EMBEDDINGS[params.category]} ${params.query}`;
    }

    const results = await searchSimilar({
      query: categoryBiasText,
      sourceType: 'semantic',
      limit: (params.topK || 5) * 2,
      minSimilarity: params.minSimilarity || 0.2,
      dim,
    });

    const entries: SemanticEntry[] = [];

    for (const r of results) {
      const memEntries = await recallMemory({
        agentId: params.agentId,
        layer: 'semantic',
        limit: 1,
      });

      const matched = memEntries.find((m) => m.id === r.entry.sourceId);

      entries.push({
        id: r.entry.id,
        content: matched?.content || r.entry.sourceId,
        embedding: r.entry.embedding,
        metadata: r.entry.metadata,
        sourceId: r.entry.sourceId,
        similarity: r.similarity,
        createdAt: r.entry.createdAt,
      });
    }

    return entries.slice(0, params.topK || 5);
  } catch (e) {
    captureError('SemanticStore.searchSemantic', e, 'Failed to search semantic entries');
    return [];
  }
}

export async function deleteSemantic(id: string): Promise<boolean> {
  try {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM memory_engine WHERE id = ? AND layer = 'semantic'", [id]);
    await deleteVector(id);
    return true;
  } catch (e) {
    captureError('SemanticStore.deleteSemantic', e, 'Failed to delete semantic entry');
    return false;
  }
}

export async function deduplicateSemantic(params: {
  agentId: AgentId;
  similarityThreshold?: number;
  dim?: number;
}): Promise<{ removed: number; kept: number }> {
  try {
    const db = await getDatabase();

    const entries = await db.getAllAsync<{
      id: string; content: string; embedding: string;
    }>(
      "SELECT id, content, (SELECT embedding FROM vector_store WHERE source_id = memory_engine.id LIMIT 1) as embedding FROM memory_engine WHERE layer = 'semantic' AND agent_id = ? ORDER BY created_at DESC",
      [params.agentId]
    );

    const threshold = params.similarityThreshold || 0.85;
    const keepIds = new Set<string>();
    const removeIds: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      if (removeIds.includes(entries[i].id)) continue;

      for (let j = i + 1; j < entries.length; j++) {
        if (removeIds.includes(entries[j].id)) continue;

        try {
          const embA = JSON.parse(entries[i].embedding || '[]') as number[];
          const embB = JSON.parse(entries[j].embedding || '[]') as number[];

          if (embA.length === 0 || embB.length === 0) continue;

          const similarity = cosineSimilarity(embA, embB);
          if (similarity >= threshold) {
            removeIds.push(entries[j].id);
          }
        } catch {
          continue;
        }
      }
      keepIds.add(entries[i].id);
    }

    for (const id of removeIds) {
      await db.runAsync('DELETE FROM memory_engine WHERE id = ?', [id]);
      await deleteVector(id);
    }

    return { removed: removeIds.length, kept: keepIds.size };
  } catch (e) {
    captureError('SemanticStore.deduplicateSemantic', e, 'Failed to deduplicate semantic entries');
    return { removed: 0, kept: 0 };
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
