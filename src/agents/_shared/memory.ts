import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../core/database/database';
import { AgentId } from '../../shared/types';
import { captureError } from '../../core/logger/logger';

export type MemoryType = 'long_term' | 'episodic';

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;
  updatedAt: string;
}

export interface SaveMemoryParams {
  agentId: AgentId;
  type: MemoryType;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface RecallMemoryParams {
  agentId: AgentId;
  type?: MemoryType;
  keyword?: string;
  limit?: number;
}

export async function saveMemory(
  params: SaveMemoryParams
): Promise<MemoryEntry | null> {
  if (!params.content || params.content.length > 2000) return null;

  const db = await getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  const enrichedContent = JSON.stringify({
    agent: params.agentId,
    timestamp: now,
    content: params.content,
    metadata: params.metadata || {},
  });

  try {
    await db.runAsync(
      'INSERT INTO memories (id, type, content, updated_at) VALUES (?, ?, ?, ?)',
      [id, params.type, enrichedContent, now]
    );

    return {
      id,
      type: params.type,
      content: params.content,
      updatedAt: now,
    };
  } catch (e) {
    captureError('Memory.saveMemory', e, 'Failed to save memory');
    return null;
  }
}

export async function recallMemory(
  params: RecallMemoryParams
): Promise<MemoryEntry[]> {
  const db = await getDatabase();
  const conditions: string[] = [];
  const values: string[] = [];

  if (params.type) {
    conditions.push('type = ?');
    values.push(params.type);
  }
  if (params.keyword) {
    conditions.push('content LIKE ?');
    values.push(`%${params.keyword}%`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(params.limit || 10, 50);

  try {
    const rows = await db.getAllAsync<{
      id: string;
      type: string;
      content: string;
      updated_at: string;
    }>(
      `SELECT id, type, content, updated_at FROM memories ${where} ORDER BY updated_at DESC LIMIT ?`,
      [...values, limit]
    );

    return rows.map((row) => {
      let parsedContent = row.content;
      try {
        const parsed = JSON.parse(row.content);
        parsedContent =
          parsed.content || parsed.agent + ': ' + (parsed.content || '');
      } catch {
        parsedContent = row.content;
      }

      return {
        id: row.id,
        type: row.type as MemoryType,
        content: parsedContent,
        updatedAt: row.updated_at,
      };
    });
  } catch (e) {
    captureError('Memory.recallMemory', e, 'Failed to recall memory');
    return [];
  }
}

export async function forgetMemory(id: string): Promise<boolean> {
  const db = await getDatabase();
  try {
    await db.runAsync('DELETE FROM memories WHERE id = ?', [id]);
    return true;
  } catch (e) {
    captureError('Memory.forgetMemory', e, 'Failed to forget memory');
    return false;
  }
}

export async function recallRecentContext(
  agentId: AgentId,
  limit?: number
): Promise<string> {
  const memories = await recallMemory({
    agentId,
    type: 'episodic',
    limit: limit || 5,
  });

  if (memories.length === 0) return '';

  let context = '## 记忆召回\n';
  for (const m of memories) {
    context += `- [${m.updatedAt}] ${m.content}\n`;
  }
  return context;
}

export async function rememberThis(
  agentId: AgentId,
  content: string
): Promise<void> {
  await saveMemory({
    agentId,
    type: 'long_term',
    content,
    metadata: { autoSaved: true },
  });
}

export async function rememberMoment(
  agentId: AgentId,
  content: string
): Promise<void> {
  await saveMemory({
    agentId,
    type: 'episodic',
    content,
    metadata: { autoSaved: true },
  });
}
