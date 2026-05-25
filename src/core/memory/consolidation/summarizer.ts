import { getDatabase } from '../../database/database';
import { recallMemory, storeMemory, MemoryEntry } from '../memory-engine';
import { generateEmbedding } from '../embedding/embedding-service';
import { captureError } from '../../logger/logger';
import type { AgentId } from '../../../shared/types';

export interface SessionSummary {
  sessionId: string;
  summary: string;
  messageCount: number;
  topics: string[];
  importantFacts: string[];
  generatedAt: string;
}

const TOPIC_THRESHOLD = 3;

export async function summarizeSession(
  sessionId: string,
  agentId: AgentId,
  options?: {
    minMessages?: number;
    maxSummaryLength?: number;
  }
): Promise<SessionSummary | null> {
  try {
    const minMessages = options?.minMessages || 5;
    const maxSummaryLength = options?.maxSummaryLength || 500;

    const workingMem = await recallMemory({
      layer: 'working',
      agentId,
      limit: 50,
    });

    const sessionMem = workingMem.filter((m) => {
      const meta = m.metadata as Record<string, unknown>;
      return meta?.sessionId === sessionId;
    });

    if (sessionMem.length < minMessages) return null;

    const topics = extractConversationTopics(sessionMem);
    const importantFacts = extractImportantFacts(sessionMem);
    const summary = buildSummaryText(sessionMem, topics, importantFacts, maxSummaryLength);

    await saveSummaryToDb(sessionId, agentId, summary, sessionMem.length, topics, importantFacts);

    return {
      sessionId,
      summary,
      messageCount: sessionMem.length,
      topics,
      importantFacts,
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    captureError('Summarizer.summarizeSession', e, 'Failed to summarize session');
    return null;
  }
}

export async function summarizeMemories(
  memories: MemoryEntry[],
  label: string,
  agentId: AgentId,
  maxLength: number = 300
): Promise<string | null> {
  try {
    if (memories.length === 0) return null;

    const topics = extractConversationTopics(memories);
    const importantFacts = extractImportantFacts(memories);
    const summary = buildSummaryText(memories, topics, importantFacts, maxLength);

    await storeToLongTerm(agentId, summary, {
      type: 'batch_summary',
      label,
      sourceCount: memories.length,
    });

    return summary;
  } catch (e) {
    captureError('Summarizer.summarizeMemories', e, 'Failed to summarize memories');
    return null;
  }
}

export async function generateDailyDigest(
  agentId: AgentId,
  date?: string
): Promise<string | null> {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];

    const db = await getDatabase();
    const memories = await db.getAllAsync<{
      id: string; content: string; created_at: string;
    }>(
      `SELECT id, content, created_at FROM memory_engine
       WHERE agent_id = ? AND created_at >= ? AND created_at < ? AND layer != 'working'
       ORDER BY importance DESC LIMIT 30`,
      [agentId, targetDate, `${targetDate}T23:59:59`]
    );

    if (memories.length === 0) return null;

    const mapped: MemoryEntry[] = memories.map((m) => ({
      id: m.id,
      layer: 'long_term' as const,
      type: 'fact' as const,
      agentId,
      content: m.content,
      metadata: {},
      importance: 0.5,
      accessCount: 0,
      lastAccessedAt: m.created_at,
      createdAt: m.created_at,
      tags: [],
    }));

    return summarizeMemories(mapped, `${targetDate} 日报`, agentId);
  } catch (e) {
    captureError('Summarizer.generateDailyDigest', e, 'Failed to generate daily digest');
    return null;
  }
}

function extractConversationTopics(memories: MemoryEntry[]): string[] {
  const topicCounter = new Map<string, number>();

  const userMsgs = memories.filter((m) => {
    const meta = m.metadata as Record<string, unknown>;
    return meta?.role === 'user';
  });

  for (const msg of userMsgs) {
    const keywords = extractKeywords(msg.content);
    for (const kw of keywords) {
      topicCounter.set(kw, (topicCounter.get(kw) || 0) + 1);
    }
  }

  return Array.from(topicCounter.entries())
    .filter(([, count]) => count >= TOPIC_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);
}

function extractImportantFacts(memories: MemoryEntry[]): string[] {
  const importanceKeywords = [
    '偏好', '喜欢', '不喜欢', '习惯', '规则', '决定', '目标',
    '重要', '记住', '不要', '总是', '经常', '每次', '不允许',
    '注意', '必须', '禁止',
  ];

  const facts: string[] = [];
  for (const mem of memories) {
    const hasImportant = importanceKeywords.some((kw) => mem.content.includes(kw));
    if (hasImportant) {
      facts.push(mem.content.slice(0, 200));
    }
  }

  return facts.slice(0, 8);
}

function buildSummaryText(
  memories: MemoryEntry[],
  topics: string[],
  importantFacts: string[],
  maxLength: number
): string {
  const lines: string[] = [];

  const dateLabel = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  lines.push(`【会话摘要 ${dateLabel}】`);

  if (topics.length > 0) {
    lines.push(`\n讨论话题: ${topics.join('、')}`);
  }

  lines.push(`\n消息数量: ${memories.length}`);
  lines.push(`时间跨度: ${getTimeSpan(memories)}`);

  if (importantFacts.length > 0) {
    lines.push('\n【重要信息】');
    for (const fact of importantFacts) {
      const truncated = fact.length > 120 ? fact.slice(0, 117) + '...' : fact;
      lines.push(`  • ${truncated}`);
    }
  }

  let summary = lines.join('\n');
  if (summary.length > maxLength) {
    summary = summary.slice(0, maxLength - 3) + '...';
  }

  return summary;
}

async function saveSummaryToDb(
  sessionId: string,
  agentId: AgentId,
  summary: string,
  messageCount: number,
  topics: string[],
  importantFacts: string[]
): Promise<void> {
  try {
    const db = await getDatabase();

    const entry = await storeMemory({
      layer: 'long_term',
      type: 'context',
      agentId,
      content: summary,
      metadata: {
        type: 'session_summary',
        sessionId,
        messageCount,
        topicCount: topics.length,
        factCount: importantFacts.length,
        generatedAt: new Date().toISOString(),
      },
      importance: 0.7,
      tags: ['summary', 'session', sessionId],
    });

    if (entry) {
      const embedding = await generateEmbedding(summary, 128);

      await db.runAsync(
        `INSERT INTO vector_store (id, embedding, metadata, source_type, source_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          `summary_${sessionId}_${Date.now()}`,
          JSON.stringify(embedding),
          JSON.stringify({ type: 'session_summary', sessionId, topics, messageCount }),
          'memory',
          entry.id,
          new Date().toISOString(),
        ]
      );
    }
  } catch (e) {
    captureError('Summarizer.saveSummaryToDb', e, 'Failed to save summary to DB');
  }
}

async function storeToLongTerm(
  agentId: AgentId,
  content: string,
  extraMeta: Record<string, unknown>
): Promise<void> {
  try {
    const entry = await storeMemory({
      layer: 'long_term',
      type: 'context',
      agentId,
      content,
      metadata: {
        type: 'batch_summary',
        generatedAt: new Date().toISOString(),
        ...extraMeta,
      },
      importance: 0.5,
      tags: ['summary', 'batch'],
    });

    if (entry) {
      const embedding = await generateEmbedding(content, 128);

      const db = await getDatabase();
      await db.runAsync(
        `INSERT INTO vector_store (id, embedding, metadata, source_type, source_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          `batch_summary_${Date.now()}`,
          JSON.stringify(embedding),
          JSON.stringify({ type: 'batch_summary', label: extraMeta.label }),
          'memory',
          entry.id,
          new Date().toISOString(),
        ]
      );
    }
  } catch (e) {
    captureError('Summarizer.storeToLongTerm', e, 'Failed to store batch summary');
  }
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
    '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
    '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '那', '吗',
  ]);

  const words = text
    .replace(/[，。！？、；：""''（）【】《》\s]/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 2 && w.length <= 10 && !stopWords.has(w));

  return words.slice(0, 10);
}

function getTimeSpan(memories: MemoryEntry[]): string {
  if (memories.length === 0) return '';

  const timestamps = memories
    .map((m) => new Date(m.createdAt).getTime())
    .filter((t) => !isNaN(t))
    .sort();

  if (timestamps.length < 2) return '';

  const start = new Date(timestamps[0]);
  const end = new Date(timestamps[timestamps.length - 1]);
  const diffMin = Math.round((end.getTime() - start.getTime()) / 60000);

  if (diffMin < 60) return `${diffMin} 分钟`;
  if (diffMin < 1440) return `${Math.round(diffMin / 60)} 小时`;
  return `${Math.round(diffMin / 1440)} 天`;
}
