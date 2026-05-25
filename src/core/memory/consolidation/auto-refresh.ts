import { getDatabase } from '../../database/database';
import { consolidateMemory } from '../memory-engine';
import { summarizeSession } from './summarizer';
import { ageOutStale, compactLongterm } from '../layers/longterm-base';
import { deduplicateSemantic } from '../layers/semantic-store';
import { captureError } from '../../logger/logger';
import type { AgentId } from '../../../shared/types';

const CONSOLIDATION_THRESHOLD = 20;

export interface ConsolidationResult {
  movedToLongTerm: number;
  deleted: number;
  summaryGenerated: boolean;
  summaryText?: string;
}

export interface DeepCleanResult {
  staleRemoved: number;
  compactedRemoved: number;
  deduplicatedRemoved: number;
}

export async function autoConsolidate(
  agentId: AgentId,
  sessionId?: string
): Promise<ConsolidationResult> {
  try {
    const db = await getDatabase();

    const countRow = await db.getFirstAsync<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM memory_engine WHERE layer = 'working' AND agent_id = ?",
      [agentId]
    );

    if (!countRow || countRow.cnt < CONSOLIDATION_THRESHOLD) {
      return { movedToLongTerm: 0, deleted: 0, summaryGenerated: false };
    }

    const engineResult = await consolidateMemory(agentId, 10);

    let summaryGenerated = false;
    let summaryText: string | undefined;

    if (sessionId && engineResult.movedToLongTerm > 0) {
      const summary = await summarizeSession(sessionId, agentId, {
        minMessages: 5,
        maxSummaryLength: 500,
      });

      if (summary) {
        summaryGenerated = true;
        summaryText = summary.summary;
      }
    }

    return {
      movedToLongTerm: engineResult.movedToLongTerm,
      deleted: engineResult.removedFromWorking,
      summaryGenerated,
      summaryText,
    };
  } catch (e) {
    captureError('AutoRefresh.autoConsolidate', e, 'Auto-consolidation failed');
    return { movedToLongTerm: 0, deleted: 0, summaryGenerated: false };
  }
}

export async function deepClean(agentId: AgentId): Promise<DeepCleanResult> {
  try {
    const [stale, compacted, dedup] = await Promise.all([
      ageOutStale(agentId, 90, 0.3),
      compactLongterm(agentId, 1000),
      deduplicateSemantic({ agentId, similarityThreshold: 0.85 }),
    ]);

    return {
      staleRemoved: stale,
      compactedRemoved: compacted.removed,
      deduplicatedRemoved: dedup.removed,
    };
  } catch (e) {
    captureError('AutoRefresh.deepClean', e, 'Deep clean failed');
    return { staleRemoved: 0, compactedRemoved: 0, deduplicatedRemoved: 0 };
  }
}

export async function promoteToLongTerm(
  memoryIds: string[]
): Promise<number> {
  try {
    const db = await getDatabase();
    let count = 0;

    for (const id of memoryIds) {
      const memory = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM memory_engine WHERE id = ?',
        [id]
      );
      if (memory) {
        await db.runAsync(
          "UPDATE memory_engine SET layer = 'long_term', importance = MIN(1.0, importance + 0.2) WHERE id = ?",
          [id]
        );
        count++;
      }
    }

    return count;
  } catch (e) {
    captureError('AutoRefresh.promoteToLongTerm', e, 'Failed to promote memories');
    return 0;
  }
}

export async function cleanupExpired(): Promise<number> {
  try {
    const db = await getDatabase();
    const now = new Date().toISOString();

    const result = await db.runAsync(
      "DELETE FROM memory_engine WHERE expires_at IS NOT NULL AND expires_at <= ?",
      [now]
    );

    return result?.changes || 0;
  } catch (e) {
    captureError('AutoRefresh.cleanupExpired', e, 'Failed to cleanup expired memories');
    return 0;
  }
}
