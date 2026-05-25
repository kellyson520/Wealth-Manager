import { EpisodicBuffer, BufferItem } from './layers/episodic-buffer';
import { storeSemantic, SemanticEntry } from './layers/semantic-store';
import { storeLongterm, searchByEntity, getLongtermStats, LongtermEntry } from './layers/longterm-base';
import { indexMemory, searchIndex, getIndexStats, IndexEntry } from './retrieval/memory-index';
import { hybridSearch, HybridSearchOptions, SearchResult } from './retrieval/hybrid-search';
import { autoConsolidate, deepClean, cleanupExpired, ConsolidationResult, DeepCleanResult } from './consolidation/auto-refresh';
import { summarizeSession, generateDailyDigest, SessionSummary } from './consolidation/summarizer';
import { storeMemory, recallMemory, forgetMemory, getMemoryStats, MemoryEntry, MemoryLayer, MemoryType, MemoryQueryParams } from './memory-engine';
import { deleteVector, getVectorStats } from '../vector/vector-store';
import type { AgentId } from '../../shared/types';

export {
  MemoryEntry, MemoryLayer, MemoryType, MemoryQueryParams,
  BufferItem, SemanticEntry, LongtermEntry, IndexEntry,
  SearchResult, HybridSearchOptions, SessionSummary,
  ConsolidationResult, DeepCleanResult,
};

export class MemoryManager {
  public readonly episodic: EpisodicBuffer;
  private agentId: AgentId;
  private sessionId: string;

  constructor(sessionId: string, agentId: AgentId = 'master') {
    this.sessionId = sessionId;
    this.agentId = agentId;
    this.episodic = new EpisodicBuffer(sessionId, agentId);
  }

  async remember(
    role: 'user' | 'assistant' | 'system',
    content: string
  ): Promise<BufferItem> {
    const item = await this.episodic.add(role, content);

    if (role === 'user') {
      try {
        await autoConsolidate(this.agentId, this.sessionId);
      } catch {
        /* best-effort */
      }
    }

    return item;
  }

  async recall(
    query: string,
    options: HybridSearchOptions = {}
  ): Promise<SearchResult[]> {
    return hybridSearch(query, {
      vectorWeight: 0.6,
      bm25Weight: 0.4,
      topK: 5,
      minScore: 0.15,
      ...options,
    });
  }

  async recallContext(maxResults: number = 5): Promise<string> {
    const recentContext = this.episodic.formatAsPrompt(1500);

    if (!recentContext || recentContext.trim().length < 10) {
      return '';
    }

    const relevantMemories = await this.recall(recentContext, {
      topK: maxResults,
      vectorWeight: 0.7,
      bm25Weight: 0.3,
    });

    const parts: string[] = [];

    if (relevantMemories.length > 0) {
      parts.push('【相关历史记忆】');
      for (const mem of relevantMemories) {
        const scorePct = Math.round(mem.score * 100);
        parts.push(`[关联度${scorePct}%] ${mem.content.slice(0, 200)}`);
      }
    }

    if (recentContext) {
      parts.push('【当前会话上下文】');
      parts.push(recentContext);
    }

    return parts.join('\n\n');
  }

  async recallAgentsFormat(
    query: string,
    maxResults: number = 5
  ): Promise<{ role: 'system' | 'user' | 'assistant'; content: string }[]> {
    const recentMessages = this.episodic.formatForAgent('', 3000);

    if (!query || query.trim().length < 2) {
      return recentMessages;
    }

    const searchResults = await this.recall(query, { topK: maxResults });
    const contextParts: string[] = [];

    if (searchResults.length > 0) {
      contextParts.push('相关历史记忆:');
      for (const r of searchResults) {
        contextParts.push(`- ${r.content.slice(0, 200)}`);
      }
    }

    if (contextParts.length > 0) {
      recentMessages.unshift({
        role: 'system',
        content: contextParts.join('\n'),
      });
    }

    return recentMessages;
  }

  async storeFact(
    content: string,
    importance: number = 0.5,
    tags: string[] = []
  ): Promise<LongtermEntry | null> {
    const entry = await storeLongterm({
      content,
      type: 'fact',
      agentId: this.agentId,
      importance,
      tags,
    });

    if (entry) {
      try {
        await indexMemory({
          content,
          sourceId: entry.id,
          sourceType: 'fact',
          agentId: this.agentId,
          importance,
          metadata: { tags },
        });
      } catch {
        /* best-effort */
      }
    }

    return entry;
  }

  async storePreference(
    content: string,
    importance: number = 0.7
  ): Promise<MemoryEntry | null> {
    const entry = await storeMemory({
      layer: 'long_term',
      type: 'preference',
      agentId: this.agentId,
      content,
      importance,
      tags: ['preference'],
    });

    return entry;
  }

  async storeRule(
    content: string,
    importance: number = 0.8
  ): Promise<SemanticEntry | null> {
    return storeSemantic({
      content,
      agentId: this.agentId,
      category: 'rule',
      importance,
    });
  }

  async findPreference(
    topic: string
  ): Promise<MemoryEntry[]> {
    return recallMemory({
      layer: 'long_term',
      type: 'preference',
      agentId: this.agentId,
      keyword: topic,
      limit: 5,
    });
  }

  async findRules(
    topic: string
  ): Promise<MemoryEntry[]> {
    return recallMemory({
      layer: 'semantic',
      type: 'rule',
      agentId: this.agentId,
      keyword: topic,
      limit: 5,
    });
  }

  async findByEntity(
    entity: string,
    limit: number = 10
  ): Promise<LongtermEntry[]> {
    return searchByEntity({
      agentId: this.agentId,
      entity,
      limit,
    });
  }

  async searchIndexed(
    query: string,
    topK: number = 5
  ): Promise<IndexEntry[]> {
    return searchIndex({
      query,
      topK,
      weights: {
        importance: 0.25,
        recency: 0.20,
        frequency: 0.15,
        similarity: 0.40,
      },
    });
  }

  async queryMemory(params: MemoryQueryParams): Promise<MemoryEntry[]> {
    if (!params.agentId) {
      params.agentId = this.agentId;
    }
    return recallMemory(params);
  }

  async forget(id: string): Promise<boolean> {
    const deleted = await forgetMemory(id);
    if (deleted) {
      await deleteVector(id);
    }
    return deleted;
  }

  async summarizeCurrentSession(): Promise<SessionSummary | null> {
    return summarizeSession(this.sessionId, this.agentId, {
      minMessages: 5,
      maxSummaryLength: 500,
    });
  }

  async generateDailyReport(date?: string): Promise<string | null> {
    return generateDailyDigest(this.agentId, date);
  }

  async stats(): Promise<{
    memory: Record<string, { count: number; oldestEntry: string; newestEntry: string }>;
    vectors: { totalVectors: number; byType: Record<string, number> };
    buffer: { turns: number; tokens: number; avgTokensPerTurn: number };
    longterm: { total: number; byType: Record<string, number>; avgImportance: number };
    index: { totalEntries: number; byType: Record<string, number> };
  }> {
    const [memStats, vecStats, ltStats, idxStats] = await Promise.all([
      getMemoryStats(),
      getVectorStats(),
      getLongtermStats(this.agentId),
      getIndexStats(),
    ]);

    const bufStats = this.episodic.getBufferStats();

    return {
      memory: memStats,
      vectors: vecStats,
      buffer: {
        turns: bufStats.turns,
        tokens: bufStats.totalTokens,
        avgTokensPerTurn: bufStats.avgTokensPerTurn,
      },
      longterm: {
        total: ltStats.total,
        byType: ltStats.byType,
        avgImportance: ltStats.avgImportance,
      },
      index: {
        totalEntries: idxStats.totalEntries,
        byType: idxStats.byType,
      },
    };
  }

  async maintain(): Promise<MaintenanceResult> {
    const [consolidation, deepCleanResult, expired] = await Promise.all([
      autoConsolidate(this.agentId, this.sessionId),
      deepClean(this.agentId),
      cleanupExpired(),
    ]);

    return {
      movedToLongTerm: consolidation.movedToLongTerm,
      deleted: consolidation.deleted,
      expiredCleaned: expired,
      summaryGenerated: consolidation.summaryGenerated,
      summaryText: consolidation.summaryText,
      deepClean: deepCleanResult,
    };
  }

  resetSession(newSessionId: string): void {
    this.sessionId = newSessionId;
    this.episodic.clear();
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getAgentId(): AgentId {
    return this.agentId;
  }
}

export interface MaintenanceResult {
  movedToLongTerm: number;
  deleted: number;
  expiredCleaned: number;
  summaryGenerated: boolean;
  summaryText?: string;
  deepClean: DeepCleanResult;
}
